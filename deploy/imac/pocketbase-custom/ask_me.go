package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
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
	askQuestionPath               = "/api/cwk/ask/questions"
	askQuestionReadPath           = "/api/cwk/ask/questions/read"
	askQuestionDeletePath         = "/api/cwk/ask/questions/{id}"
	askQuestionBodyMaxBytes       = int64(64 * 1024)
	askQuestionMaxRunes           = 1000
	askQuestionReceiptBytes       = 32
	askQuestionReadMaxFailures    = 5
	askQuestionReadMaxGlobal      = 60
	askQuestionReadFailureWindow  = 10 * time.Minute
	askQuestionCreateMaxPerClient = 5
	askQuestionCreateMaxGlobal    = 60
	askQuestionCreateWindow       = 10 * time.Minute
	askQuestionLimiterMaxClients  = 4096
	askQuestionLimiterSweepEvery  = 64
	askQuestionClientIPHeader     = "X-CWK-Client-IP"
	askQuestionGlobalLimitKey     = "global"
)

type askQuestionService struct {
	app               core.App
	readFailures      *askQuestionLimiter
	readGlobal        *askQuestionLimiter
	createByClient    *askQuestionLimiter
	createGlobal      *askQuestionLimiter
	createQuotaMu     sync.Mutex
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

type askQuestionLimitEntry struct {
	count    int
	inFlight int
	resetAt  time.Time
}

type askQuestionLimiter struct {
	mu             sync.Mutex
	entries        map[string]askQuestionLimitEntry
	max            int
	window         time.Duration
	maxEntries     int
	operationCount uint64
}

func newAskQuestionService(app core.App) *askQuestionService {
	dummyHash, _ := hashAskQuestionPassword("unavailable")
	return &askQuestionService{
		app:               app,
		readFailures:      newAskQuestionLimiter(askQuestionReadMaxFailures, askQuestionReadFailureWindow, askQuestionLimiterMaxClients),
		readGlobal:        newAskQuestionLimiter(askQuestionReadMaxGlobal, askQuestionReadFailureWindow, 1),
		createByClient:    newAskQuestionLimiter(askQuestionCreateMaxPerClient, askQuestionCreateWindow, askQuestionLimiterMaxClients),
		createGlobal:      newAskQuestionLimiter(askQuestionCreateMaxGlobal, askQuestionCreateWindow, 1),
		dummyPasswordHash: dummyHash,
	}
}

func newAskQuestionLimiter(max int, window time.Duration, maxEntries int) *askQuestionLimiter {
	if max < 1 {
		max = 1
	}
	if window <= 0 {
		window = time.Minute
	}
	if maxEntries < 1 {
		maxEntries = 1
	}
	return &askQuestionLimiter{
		entries:    make(map[string]askQuestionLimitEntry),
		max:        max,
		window:     window,
		maxEntries: maxEntries,
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
	if !service.allowQuestionCreate(askQuestionClientIP(e.Request), time.Now()) {
		return e.TooManyRequestsError("잠시 후 다시 시도해주세요.", nil)
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
		activeQuestions, err := findActiveAskQuestions(txApp)
		if err != nil {
			return fmt.Errorf("find active ask questions: %w", err)
		}
		displaySequence := len(activeQuestions) + 1

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
		record.Set("asker_name", askQuestionAskerName(displaySequence))
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
			"accepted":         true,
			"id":               record.Id,
			"sequence":         sequence,
			"display_sequence": displaySequence,
			"asker_name":       record.GetString("asker_name"),
			"receipt_token":    receiptToken,
			"status":           status,
			"created":          record.GetDateTime("created"),
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
	clientKey := askQuestionClientIP(e.Request)
	// Reserve a failure-budget slot before parsing, querying, or running bcrypt.
	// Without this atomic reservation, a same-IP burst can pass the separate
	// blocked check before any request has recorded its failure.
	if !service.readFailures.reserve(clientKey, now) {
		return e.TooManyRequestsError("잠시 후 다시 시도해주세요.", nil)
	}
	if !service.readGlobal.reserve(askQuestionGlobalLimitKey, now) {
		service.readFailures.complete(clientKey, now, false)
		return e.TooManyRequestsError("잠시 후 다시 시도해주세요.", nil)
	}
	failed := true
	defer func() {
		completedAt := time.Now()
		service.readFailures.complete(clientKey, completedAt, failed)
		// Every admitted read consumes the global budget, including a valid
		// password. Otherwise an attacker can authenticate their own private
		// question repeatedly and keep bcrypt busy without ever reaching a cap.
		service.readGlobal.complete(askQuestionGlobalLimitKey, completedAt, true)
	}()

	request := askQuestionReadRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.NotFoundError("질문을 확인할 수 없습니다.", nil)
	}

	record, authenticated := service.authenticateQuestionRead(request)
	if !authenticated {
		return e.NotFoundError("질문을 확인할 수 없습니다.", nil)
	}
	failed = false

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

func (service *askQuestionService) allowQuestionCreate(clientKey string, now time.Time) bool {
	service.createQuotaMu.Lock()
	defer service.createQuotaMu.Unlock()

	if service.createByClient.blocked(clientKey, now) || service.createGlobal.blocked(askQuestionGlobalLimitKey, now) {
		return false
	}
	return service.createByClient.allow(clientKey, now) && service.createGlobal.allow(askQuestionGlobalLimitKey, now)
}

// askQuestionClientIP only trusts the dedicated upstream header when the direct
// peer is loopback. The production PocketBase service binds to 127.0.0.1 and
// Caddy overwrites this header before proxying, so public clients cannot supply it.
func askQuestionClientIP(request *http.Request) string {
	remoteIP := askQuestionRemoteIP(request.RemoteAddr)
	if remoteIP == nil {
		return "unknown"
	}
	if !remoteIP.IsLoopback() {
		return remoteIP.String()
	}

	values := request.Header.Values(askQuestionClientIPHeader)
	if len(values) != 1 {
		return remoteIP.String()
	}
	upstreamIP := net.ParseIP(strings.TrimSpace(values[0]))
	if upstreamIP == nil {
		return remoteIP.String()
	}
	return upstreamIP.String()
}

func askQuestionRemoteIP(remoteAddr string) net.IP {
	remoteAddr = strings.TrimSpace(remoteAddr)
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return net.ParseIP(host)
	}
	return net.ParseIP(remoteAddr)
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
		record, err = findActiveAskQuestionByDisplaySequence(service.app, request.Sequence)
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

func (service *askQuestionService) softDeleteQuestion(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	if !isPocketBaseRecordID(id) {
		return e.NotFoundError("질문을 찾지 못했습니다.", nil)
	}

	err := service.app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindRecordById("ask_questions", id)
		if err != nil {
			return err
		}
		if record.GetBool("deleted") {
			return nil
		}

		record.Set("question", "")
		record.Set("answer", "")
		record.Set("answered_at", "")
		record.Set("deleted", true)
		record.Set("deleted_at", types.NowDateTime())
		if err := txApp.Save(record); err != nil {
			return fmt.Errorf("save deleted ask question: %w", err)
		}
		if err := renumberActiveAskQuestionNames(txApp); err != nil {
			return fmt.Errorf("renumber active ask questions: %w", err)
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("질문을 삭제하지 못했습니다.", err)
	}

	return e.JSON(http.StatusOK, map[string]any{
		"id":      id,
		"deleted": true,
	})
}

func findActiveAskQuestions(app core.App) ([]*core.Record, error) {
	return app.FindRecordsByFilter("ask_questions", "deleted = false", "sequence", 0, 0)
}

func findActiveAskQuestionByDisplaySequence(app core.App, displaySequence int) (*core.Record, error) {
	if displaySequence < 1 {
		return nil, fmt.Errorf("invalid display sequence")
	}
	records, err := findActiveAskQuestions(app)
	if err != nil {
		return nil, err
	}
	if displaySequence > len(records) {
		return nil, fmt.Errorf("display sequence not found")
	}
	return records[displaySequence-1], nil
}

func renumberActiveAskQuestionNames(app core.App) error {
	records, err := findActiveAskQuestions(app)
	if err != nil {
		return err
	}
	for index, record := range records {
		name := askQuestionAskerName(index + 1)
		if record.GetString("asker_name") == name {
			continue
		}
		record.Set("asker_name", name)
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
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

func (limiter *askQuestionLimiter) blocked(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.sweepExpiredLocked(now, false)
	entry, ok := limiter.entries[key]
	if !ok {
		if len(limiter.entries) >= limiter.maxEntries {
			limiter.sweepExpiredLocked(now, true)
			return len(limiter.entries) >= limiter.maxEntries
		}
		return false
	}
	entry, ok = limiter.refreshEntryLocked(key, entry, now)
	return ok && entry.count+entry.inFlight >= limiter.max
}

// reserve atomically admits at most max concurrent/failed attempts for a key.
// A successful completion releases its slot; a failed completion converts the
// slot into a failure that remains until the window expires.
func (limiter *askQuestionLimiter) reserve(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.sweepExpiredLocked(now, false)
	entry, ok := limiter.entries[key]
	if ok {
		entry, ok = limiter.refreshEntryLocked(key, entry, now)
	}
	if !ok {
		if len(limiter.entries) >= limiter.maxEntries {
			limiter.sweepExpiredLocked(now, true)
			if len(limiter.entries) >= limiter.maxEntries {
				return false
			}
		}
		entry = askQuestionLimitEntry{resetAt: now.Add(limiter.window)}
	}
	if entry.count+entry.inFlight >= limiter.max {
		return false
	}
	entry.inFlight++
	limiter.entries[key] = entry
	return true
}

func (limiter *askQuestionLimiter) complete(key string, now time.Time, failed bool) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	entry, ok := limiter.entries[key]
	if !ok || entry.inFlight < 1 {
		return
	}
	if !now.Before(entry.resetAt) {
		entry.count = 0
		entry.resetAt = now.Add(limiter.window)
	}
	entry.inFlight--
	if failed {
		entry.count++
	}
	if entry.count == 0 && entry.inFlight == 0 {
		delete(limiter.entries, key)
		return
	}
	limiter.entries[key] = entry
}

func (limiter *askQuestionLimiter) fail(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.sweepExpiredLocked(now, false)
	entry, ok := limiter.entries[key]
	if ok {
		entry, ok = limiter.refreshEntryLocked(key, entry, now)
	}
	if !ok {
		if len(limiter.entries) >= limiter.maxEntries {
			limiter.sweepExpiredLocked(now, true)
			if len(limiter.entries) >= limiter.maxEntries {
				return true
			}
		}
		entry = askQuestionLimitEntry{resetAt: now.Add(limiter.window)}
	}
	entry.count++
	limiter.entries[key] = entry
	return entry.count+entry.inFlight >= limiter.max
}

func (limiter *askQuestionLimiter) allow(key string, now time.Time) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	limiter.sweepExpiredLocked(now, false)
	entry, ok := limiter.entries[key]
	if ok {
		entry, ok = limiter.refreshEntryLocked(key, entry, now)
	}
	if !ok {
		if len(limiter.entries) >= limiter.maxEntries {
			limiter.sweepExpiredLocked(now, true)
			if len(limiter.entries) >= limiter.maxEntries {
				return false
			}
		}
		entry = askQuestionLimitEntry{resetAt: now.Add(limiter.window)}
	}
	if entry.count+entry.inFlight >= limiter.max {
		return false
	}
	entry.count++
	limiter.entries[key] = entry
	return true
}

func (limiter *askQuestionLimiter) refreshEntryLocked(key string, entry askQuestionLimitEntry, now time.Time) (askQuestionLimitEntry, bool) {
	if now.Before(entry.resetAt) {
		return entry, true
	}
	if entry.inFlight == 0 {
		delete(limiter.entries, key)
		return askQuestionLimitEntry{}, false
	}
	entry.count = 0
	entry.resetAt = now.Add(limiter.window)
	limiter.entries[key] = entry
	return entry, true
}

func (limiter *askQuestionLimiter) sweepExpiredLocked(now time.Time, force bool) {
	limiter.operationCount++
	if !force && limiter.operationCount%askQuestionLimiterSweepEvery != 0 {
		return
	}
	for key, entry := range limiter.entries {
		if !now.Before(entry.resetAt) {
			if entry.inFlight == 0 {
				delete(limiter.entries, key)
				continue
			}
			entry.count = 0
			entry.resetAt = now.Add(limiter.window)
			limiter.entries[key] = entry
		}
	}
}

func (limiter *askQuestionLimiter) size() int {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	return len(limiter.entries)
}
