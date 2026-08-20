package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	"golang.org/x/crypto/bcrypt"
)

const (
	askQuestionPath              = "/api/cwk/ask/questions"
	askQuestionReadPath          = "/api/cwk/ask/questions/read"
	askQuestionDeletePath        = "/api/cwk/ask/questions/{id}"
	askQuestionBodyMaxBytes      = int64(64 * 1024)
	askQuestionMaxRunes          = 1000
	askQuestionReceiptBytes      = 32
	askQuestionReadMaxFailures   = 5
	askQuestionReadFailureWindow = 10 * time.Minute
)

type askQuestionService struct {
	app               core.App
	readFailures      *askQuestionReadLimiter
	dummyPasswordHash string
}

type askQuestionRequest struct {
	Question  string `json:"question" form:"question"`
	IsPrivate bool   `json:"is_private" form:"is_private"`
	Password  string `json:"password" form:"password"`
	Honeypot  string `json:"website" form:"website"`
}

type askQuestionReadRequest struct {
	ID           string `json:"id" form:"id"`
	Sequence     int    `json:"sequence" form:"sequence"`
	ReceiptToken string `json:"receipt_token" form:"receipt_token"`
	Password     string `json:"password" form:"password"`
}

type askQuestionReadFailure struct {
	count   int
	resetAt time.Time
}

type askQuestionReadLimiter struct {
	mu       sync.Mutex
	failures map[string]askQuestionReadFailure
	max      int
	window   time.Duration
}

func newAskQuestionService(app core.App) *askQuestionService {
	dummyHash, _ := hashAskQuestionPassword("unavailable")
	return &askQuestionService{
		app:               app,
		readFailures:      newAskQuestionReadLimiter(askQuestionReadMaxFailures, askQuestionReadFailureWindow),
		dummyPasswordHash: dummyHash,
	}
}

func newAskQuestionReadLimiter(maxFailures int, window time.Duration) *askQuestionReadLimiter {
	return &askQuestionReadLimiter{
		failures: make(map[string]askQuestionReadFailure),
		max:      maxFailures,
		window:   window,
	}
}

func (service *askQuestionService) registerRoutes(e *core.ServeEvent) {
	e.Router.POST(askQuestionPath, service.createQuestion).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(askQuestionBodyMaxBytes))
	e.Router.POST(askQuestionReadPath, service.readQuestion).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(askQuestionBodyMaxBytes))
	e.Router.DELETE(askQuestionDeletePath, service.softDeleteQuestion).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
}

func (service *askQuestionService) createQuestion(e *core.RequestEvent) error {
	request := askQuestionRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("질문을 읽지 못했습니다.", err)
	}

	// Silently accept bot submissions so the honeypot does not reveal itself.
	if strings.TrimSpace(request.Honeypot) != "" {
		return e.JSON(http.StatusCreated, map[string]any{"accepted": true})
	}

	question := strings.TrimSpace(request.Question)
	if question == "" {
		return e.BadRequestError("질문을 입력해주세요.", nil)
	}
	if utf8.RuneCountInString(question) > askQuestionMaxRunes {
		return e.BadRequestError("질문은 1000자까지 남길 수 있습니다.", nil)
	}
	if request.IsPrivate && strings.TrimSpace(request.Password) == "" {
		return e.BadRequestError("비공개 질문에는 비밀번호가 필요합니다.", nil)
	}

	receiptToken, err := newAskQuestionReceiptToken()
	if err != nil {
		return e.InternalServerError("질문 확인 정보를 만들지 못했습니다.", err)
	}
	receiptHash := hashAskQuestionReceiptToken(receiptToken)

	passwordHash := ""
	if request.IsPrivate {
		passwordHash, err = hashAskQuestionPassword(request.Password)
		if err != nil {
			return e.InternalServerError("질문 비밀번호를 보호하지 못했습니다.", err)
		}
	}

	var response map[string]any
	err = service.app.RunInTransaction(func(txApp core.App) error {
		counter, err := txApp.FindFirstRecordByData("ask_question_counters", "key", "global")
		if err != nil {
			return fmt.Errorf("find ask question counter: %w", err)
		}

		sequence := counter.GetInt("value") + 1
		counter.Set("value", sequence)
		if err := txApp.Save(counter); err != nil {
			return fmt.Errorf("increment ask question counter: %w", err)
		}

		collection, err := txApp.FindCollectionByNameOrId("ask_questions")
		if err != nil {
			return fmt.Errorf("find ask questions collection: %w", err)
		}

		record := core.NewRecord(collection)
		record.Set("sequence", sequence)
		record.Set("asker_name", askQuestionAskerName(sequence))
		record.Set("question", question)
		record.Set("is_private", request.IsPrivate)
		record.Set("receipt_token_hash", receiptHash)
		record.Set("private_password_hash", passwordHash)
		record.Set("deleted", false)
		if err := txApp.Save(record); err != nil {
			return fmt.Errorf("save ask question: %w", err)
		}

		status := "pending"
		if request.IsPrivate {
			status = "private"
		}
		response = map[string]any{
			"accepted":      true,
			"id":            record.Id,
			"sequence":      sequence,
			"asker_name":    record.GetString("asker_name"),
			"receipt_token": receiptToken,
			"status":        status,
			"created":       record.GetDateTime("created"),
		}

		return nil
	})
	if err != nil {
		return e.InternalServerError("질문을 저장하지 못했습니다.", err)
	}

	return e.JSON(http.StatusCreated, response)
}

func (service *askQuestionService) readQuestion(e *core.RequestEvent) error {
	now := time.Now()
	request := askQuestionReadRequest{}
	if err := e.BindBody(&request); err != nil {
		return service.failedQuestionRead(e, e.RealIP()+"|invalid", now)
	}
	limitKey := askQuestionReadLimitKey(e.RealIP(), request)
	if service.readFailures.blocked(limitKey, now) {
		return e.TooManyRequestsError("잠시 후 다시 시도해주세요.", nil)
	}

	record, authenticated := service.authenticateQuestionRead(request)
	if !authenticated {
		return service.failedQuestionRead(e, limitKey, now)
	}
	service.readFailures.success(limitKey)

	deleted := record.GetBool("deleted")
	question := record.GetString("question")
	answer := record.GetString("answer")
	answeredAt := record.GetDateTime("answered_at")
	if deleted {
		question = ""
		answer = ""
		answeredAt = types.DateTime{}
	}

	return e.JSON(http.StatusOK, map[string]any{
		"id":          record.Id,
		"sequence":    record.GetInt("sequence"),
		"asker_name":  record.GetString("asker_name"),
		"created":     record.GetDateTime("created"),
		"question":    question,
		"answer":      answer,
		"answered_at": answeredAt,
		"is_private":  record.GetBool("is_private"),
		"deleted":     deleted,
	})
}

func askQuestionReadLimitKey(clientIP string, request askQuestionReadRequest) string {
	id := strings.TrimSpace(request.ID)
	if isPocketBaseRecordID(id) {
		return clientIP + "|id:" + id
	}
	if request.Sequence > 0 {
		return fmt.Sprintf("%s|sequence:%d", clientIP, request.Sequence)
	}
	return clientIP + "|invalid"
}

func (service *askQuestionService) authenticateQuestionRead(request askQuestionReadRequest) (*core.Record, bool) {
	id := strings.TrimSpace(request.ID)
	receiptToken := strings.TrimSpace(request.ReceiptToken)
	if receiptToken != "" && isPocketBaseRecordID(id) {
		record, err := service.app.FindRecordById("ask_questions", id)
		if err == nil && verifyAskQuestionReceiptToken(record.GetString("receipt_token_hash"), receiptToken) {
			return record, true
		}
		return nil, false
	}

	if strings.TrimSpace(request.Password) == "" {
		return nil, false
	}

	var record *core.Record
	var err error
	if isPocketBaseRecordID(id) {
		record, err = service.app.FindRecordById("ask_questions", id)
	} else if request.Sequence > 0 {
		record, err = service.app.FindFirstRecordByData("ask_questions", "sequence", request.Sequence)
	} else {
		verifyAskQuestionPassword(service.dummyPasswordHash, request.Password)
		return nil, false
	}

	if err != nil || record == nil || !record.GetBool("is_private") {
		verifyAskQuestionPassword(service.dummyPasswordHash, request.Password)
		return nil, false
	}
	if !verifyAskQuestionPassword(record.GetString("private_password_hash"), request.Password) {
		return nil, false
	}

	return record, true
}

func (service *askQuestionService) failedQuestionRead(e *core.RequestEvent, clientKey string, now time.Time) error {
	if service.readFailures.fail(clientKey, now) {
		return e.TooManyRequestsError("잠시 후 다시 시도해주세요.", nil)
	}
	return e.NotFoundError("질문을 확인할 수 없습니다.", nil)
}

func (service *askQuestionService) softDeleteQuestion(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	if !isPocketBaseRecordID(id) {
		return e.NotFoundError("질문을 찾지 못했습니다.", nil)
	}

	record, err := service.app.FindRecordById("ask_questions", id)
	if err != nil {
		return e.NotFoundError("질문을 찾지 못했습니다.", nil)
	}
	if !record.GetBool("deleted") {
		record.Set("question", "")
		record.Set("answer", "")
		record.Set("answered_at", "")
		record.Set("deleted", true)
		record.Set("deleted_at", types.NowDateTime())
		if err := service.app.Save(record); err != nil {
			return e.InternalServerError("질문을 삭제하지 못했습니다.", err)
		}
	}

	return e.JSON(http.StatusOK, map[string]any{
		"id":      record.Id,
		"deleted": true,
	})
}

func askQuestionAskerName(sequence int) string {
	return fmt.Sprintf("%d번째 질문", sequence)
}

func newAskQuestionReceiptToken() (string, error) {
	raw := make([]byte, askQuestionReceiptBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashAskQuestionReceiptToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func verifyAskQuestionReceiptToken(storedHash string, token string) bool {
	computed := hashAskQuestionReceiptToken(token)
	return len(storedHash) == len(computed) && subtle.ConstantTimeCompare([]byte(storedHash), []byte(computed)) == 1
}

func hashAskQuestionPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword(askQuestionPasswordDigest(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func verifyAskQuestionPassword(storedHash string, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(storedHash), askQuestionPasswordDigest(password)) == nil
}

func askQuestionPasswordDigest(password string) []byte {
	hash := sha256.New()
	hash.Write([]byte("coldwaterkim-ask-question-password-v1\x00"))
	hash.Write([]byte(password))
	return hash.Sum(nil)
}

func (limiter *askQuestionReadLimiter) blocked(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	failure, ok := limiter.failures[key]
	if !ok {
		return false
	}
	if !now.Before(failure.resetAt) {
		delete(limiter.failures, key)
		return false
	}
	return failure.count >= limiter.max
}

func (limiter *askQuestionReadLimiter) fail(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	failure, ok := limiter.failures[key]
	if !ok || !now.Before(failure.resetAt) {
		failure = askQuestionReadFailure{resetAt: now.Add(limiter.window)}
	}
	failure.count++
	limiter.failures[key] = failure
	return failure.count >= limiter.max
}

func (limiter *askQuestionReadLimiter) success(key string) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	delete(limiter.failures, key)
}
