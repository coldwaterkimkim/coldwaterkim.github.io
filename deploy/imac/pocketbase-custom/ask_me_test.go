package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestAskQuestionAskerName(t *testing.T) {
	if got, want := askQuestionAskerName(42), "42번째 질문"; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestAskQuestionReceiptAndPasswordHashing(t *testing.T) {
	token, err := newAskQuestionReceiptToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(token) != 43 {
		t.Fatalf("receipt token length = %d, want 43", len(token))
	}
	receiptHash := hashAskQuestionReceiptToken(token)
	if receiptHash == token || strings.Contains(receiptHash, token) {
		t.Fatal("receipt hash must not contain the raw token")
	}
	if !verifyAskQuestionReceiptToken(receiptHash, token) || verifyAskQuestionReceiptToken(receiptHash, token+"x") {
		t.Fatal("receipt token verification mismatch")
	}

	password := strings.Repeat("긴 비밀번호 ", 100)
	passwordHash, err := hashAskQuestionPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if passwordHash == password || strings.Contains(passwordHash, password) {
		t.Fatal("password hash must not contain the raw password")
	}
	if !verifyAskQuestionPassword(passwordHash, password) || verifyAskQuestionPassword(passwordHash, password+"x") {
		t.Fatal("password verification mismatch")
	}
}

func TestAskQuestionReadLimiter(t *testing.T) {
	limiter := newAskQuestionLimiter(3, time.Minute, 2)
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	if limiter.fail("client", now) || limiter.fail("client", now) {
		t.Fatal("client blocked before reaching failure limit")
	}
	if !limiter.fail("client", now) || !limiter.blocked("client", now) {
		t.Fatal("client was not blocked at failure limit")
	}
	if limiter.blocked("client", now.Add(time.Minute)) {
		t.Fatal("expired failure window did not reset")
	}

	if !limiter.allow("create-client", now.Add(2*time.Minute)) ||
		!limiter.allow("create-client", now.Add(2*time.Minute)) ||
		!limiter.allow("create-client", now.Add(2*time.Minute)) {
		t.Fatal("quota rejected a client before the limit")
	}
	if limiter.allow("create-client", now.Add(2*time.Minute)) {
		t.Fatal("quota allowed a client past the limit")
	}
}

func TestAskQuestionReadReservationsAreAtomic(t *testing.T) {
	limiter := newAskQuestionLimiter(askQuestionReadMaxFailures, time.Minute, askQuestionLimiterMaxClients)
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	const requestCount = 200

	start := make(chan struct{})
	release := make(chan struct{})
	var admitted atomic.Int64
	var decisions sync.WaitGroup
	var workers sync.WaitGroup
	decisions.Add(requestCount)
	workers.Add(requestCount)
	for index := 0; index < requestCount; index++ {
		go func() {
			defer workers.Done()
			<-start
			reserved := limiter.reserve("same-client", now)
			if reserved {
				admitted.Add(1)
			}
			decisions.Done()
			if !reserved {
				return
			}
			<-release
			limiter.complete("same-client", now, false)
		}()
	}

	close(start)
	decisions.Wait()
	if got := admitted.Load(); got != askQuestionReadMaxFailures {
		t.Fatalf("concurrent read reservations admitted=%d want=%d", got, askQuestionReadMaxFailures)
	}
	close(release)
	workers.Wait()

	if limiter.blocked("same-client", now) {
		t.Fatal("successful reads consumed the failure budget")
	}
	if !limiter.reserve("same-client", now) {
		t.Fatal("successful reads did not release their reservation")
	}
	limiter.complete("same-client", now, true)
	if limiter.blocked("same-client", now) {
		t.Fatal("a single failed read exhausted the failure budget")
	}
}

func TestAskQuestionReadBurstStopsBeforeAuthentication(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	setupAskQuestionTestCollections(t, app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service := newAskQuestionService(app)
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	const requestCount = 100
	start := make(chan struct{})
	statuses := make(chan int, requestCount)
	var workers sync.WaitGroup
	workers.Add(requestCount)
	for index := 0; index < requestCount; index++ {
		go func() {
			defer workers.Done()
			<-start
			request := httptest.NewRequest(
				http.MethodPost,
				askQuestionReadPath,
				strings.NewReader(`{"sequence":1,"password":"wrong"}`),
			)
			request.RemoteAddr = "198.51.100.50:5000"
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			statuses <- response.Code
		}()
	}

	close(start)
	workers.Wait()
	close(statuses)

	notFound := 0
	tooManyRequests := 0
	for status := range statuses {
		switch status {
		case http.StatusNotFound:
			notFound++
		case http.StatusTooManyRequests:
			tooManyRequests++
		default:
			t.Fatalf("unexpected burst response status=%d", status)
		}
	}
	if notFound != askQuestionReadMaxFailures || tooManyRequests != requestCount-askQuestionReadMaxFailures {
		t.Fatalf(
			"burst reached authentication=%d rejected-before-auth=%d want=%d/%d",
			notFound,
			tooManyRequests,
			askQuestionReadMaxFailures,
			requestCount-askQuestionReadMaxFailures,
		)
	}
}

func TestAskQuestionDistributedReadBurstHasGlobalAdmissionCap(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	setupAskQuestionTestCollections(t, app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service := newAskQuestionService(app)
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	const requestCount = 100
	start := make(chan struct{})
	statuses := make(chan int, requestCount)
	var workers sync.WaitGroup
	workers.Add(requestCount)
	for index := 0; index < requestCount; index++ {
		go func(client int) {
			defer workers.Done()
			<-start
			request := httptest.NewRequest(
				http.MethodPost,
				askQuestionReadPath,
				strings.NewReader(`{"sequence":1,"password":"wrong"}`),
			)
			request.RemoteAddr = fmt.Sprintf("198.51.%d.%d:5000", client/254, client%254+1)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			statuses <- response.Code
		}(index)
	}

	close(start)
	workers.Wait()
	close(statuses)

	notFound := 0
	tooManyRequests := 0
	for status := range statuses {
		switch status {
		case http.StatusNotFound:
			notFound++
		case http.StatusTooManyRequests:
			tooManyRequests++
		default:
			t.Fatalf("unexpected distributed burst response status=%d", status)
		}
	}
	if notFound != askQuestionReadMaxGlobal || tooManyRequests != requestCount-askQuestionReadMaxGlobal {
		t.Fatalf(
			"distributed burst reached authentication=%d rejected-before-auth=%d want=%d/%d",
			notFound,
			tooManyRequests,
			askQuestionReadMaxGlobal,
			requestCount-askQuestionReadMaxGlobal,
		)
	}
}

func TestAskQuestionLimiterBoundsAndExpiryRecovery(t *testing.T) {
	limiter := newAskQuestionLimiter(2, time.Minute, 2)
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	limiter.fail("client-a", now)
	limiter.fail("client-b", now)

	if !limiter.blocked("client-c", now) {
		t.Fatal("full limiter map did not fail closed for an unseen client")
	}
	if got := limiter.size(); got != 2 {
		t.Fatalf("limiter size=%d want=2", got)
	}

	afterExpiry := now.Add(time.Minute)
	if limiter.blocked("client-c", afterExpiry) {
		t.Fatal("expired limiter map did not recover capacity")
	}
	if limiter.fail("client-c", afterExpiry) {
		t.Fatal("new client was blocked after expired entries were swept")
	}
	if got := limiter.size(); got > 2 {
		t.Fatalf("limiter exceeded map cap: size=%d", got)
	}

	sweepingLimiter := newAskQuestionLimiter(2, time.Minute, 100)
	sweepingLimiter.fail("expired-client", now)
	for operation := 1; operation < askQuestionLimiterSweepEvery; operation++ {
		sweepingLimiter.blocked("unseen-client", afterExpiry)
	}
	if got := sweepingLimiter.size(); got != 0 {
		t.Fatalf("periodic expiry sweep retained %d stale entries", got)
	}
}

func TestAskQuestionCreateQuotaIsAtomic(t *testing.T) {
	service := &askQuestionService{
		createByClient: newAskQuestionLimiter(100, time.Minute, askQuestionLimiterMaxClients),
		createGlobal:   newAskQuestionLimiter(60, time.Minute, 1),
	}
	now := time.Date(2026, time.August, 20, 12, 0, 0, 0, time.UTC)
	var accepted atomic.Int64
	var workers sync.WaitGroup
	for index := 0; index < 100; index++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			if service.allowQuestionCreate(fmt.Sprintf("client-%d", index), now) {
				accepted.Add(1)
			}
		}(index)
	}
	workers.Wait()
	if got := accepted.Load(); got != 60 {
		t.Fatalf("concurrent global quota accepted=%d want=60", got)
	}
}

func TestAskQuestionClientIPTrustBoundary(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		headers    []string
		want       string
	}{
		{
			name:       "direct client cannot spoof upstream header",
			remoteAddr: "198.51.100.10:1234",
			headers:    []string{"203.0.113.20"},
			want:       "198.51.100.10",
		},
		{
			name:       "loopback proxy header is trusted",
			remoteAddr: "127.0.0.1:5432",
			headers:    []string{"203.0.113.20"},
			want:       "203.0.113.20",
		},
		{
			name:       "multiple proxy header values fail closed",
			remoteAddr: "127.0.0.1:5432",
			headers:    []string{"203.0.113.20", "203.0.113.21"},
			want:       "127.0.0.1",
		},
		{
			name:       "comma-separated proxy chain is rejected",
			remoteAddr: "127.0.0.1:5432",
			headers:    []string{"203.0.113.20, 203.0.113.21"},
			want:       "127.0.0.1",
		},
		{
			name:       "invalid proxy header falls back to loopback",
			remoteAddr: "[::1]:5432",
			headers:    []string{"not-an-ip"},
			want:       "::1",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, askQuestionReadPath, nil)
			request.RemoteAddr = test.remoteAddr
			for _, value := range test.headers {
				request.Header.Add(askQuestionClientIPHeader, value)
			}
			if got := askQuestionClientIP(request); got != test.want {
				t.Fatalf("client IP=%q want=%q", got, test.want)
			}
		})
	}
}

func TestAskQuestionCreateQuotas(t *testing.T) {
	if askQuestionCreateMaxPerClient != 5 || askQuestionCreateMaxGlobal != 60 || askQuestionCreateWindow != 10*time.Minute {
		t.Fatalf(
			"unexpected production create quota: client=%d global=%d window=%s",
			askQuestionCreateMaxPerClient,
			askQuestionCreateMaxGlobal,
			askQuestionCreateWindow,
		)
	}
	if askQuestionLimiterMaxClients != 4096 || askQuestionLimiterSweepEvery != 64 {
		t.Fatalf(
			"unexpected limiter bounds: maxClients=%d sweepEvery=%d",
			askQuestionLimiterMaxClients,
			askQuestionLimiterSweepEvery,
		)
	}

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	setupAskQuestionTestCollections(t, app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service := newAskQuestionService(app)
	service.createByClient = newAskQuestionLimiter(2, time.Minute, askQuestionLimiterMaxClients)
	service.createGlobal = newAskQuestionLimiter(100, time.Minute, 1)
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	for attempt := 1; attempt <= 2; attempt++ {
		response := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
			"question": "client quota question",
		}, "198.51.100.30:3000", "")
		if response.Code != http.StatusCreated {
			t.Fatalf("client create attempt %d status=%d body=%s", attempt, response.Code, response.Body.String())
		}
	}
	clientBlocked := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question":   "must be rejected before hashing or insert",
		"is_private": true,
		"password":   "expensive password",
	}, "198.51.100.30:3000", "")
	if clientBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("client quota status=%d body=%s", clientBlocked.Code, clientBlocked.Body.String())
	}
	differentClient := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question": "different client remains available",
	}, "198.51.100.31:3001", "")
	if differentClient.Code != http.StatusCreated {
		t.Fatalf("different client status=%d body=%s", differentClient.Code, differentClient.Body.String())
	}

	records, err := app.FindRecordsByFilter("ask_questions", "", "sequence", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 3 {
		t.Fatalf("client-blocked request changed DB: records=%d want=3", len(records))
	}

	service.createByClient = newAskQuestionLimiter(100, time.Minute, askQuestionLimiterMaxClients)
	service.createGlobal = newAskQuestionLimiter(2, time.Minute, 1)
	for attempt := 1; attempt <= 2; attempt++ {
		response := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
			"question": "global quota question",
		}, fmt.Sprintf("203.0.113.%d:4000", attempt), "")
		if response.Code != http.StatusCreated {
			t.Fatalf("global create attempt %d status=%d body=%s", attempt, response.Code, response.Body.String())
		}
	}
	globalBlocked := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question": "global quota must reject this",
	}, "203.0.113.3:4000", "")
	if globalBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("global quota status=%d body=%s", globalBlocked.Code, globalBlocked.Body.String())
	}
}

func TestAskQuestionAuthorWorkflow(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	setupAskQuestionTestCollections(t, app)

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service := newAskQuestionService(app)
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	publicCreate := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question":   "공개 질문 원문",
		"is_private": false,
		"password":   "공개 질문에서는 저장하면 안 됨",
	}, "198.51.100.1:1001", "")
	if publicCreate.Code != http.StatusCreated {
		t.Fatalf("public create status=%d body=%s", publicCreate.Code, publicCreate.Body.String())
	}
	publicReceipt := decodeAskQuestionCreateResponse(t, publicCreate.Body.Bytes())
	if publicReceipt.AskerName != "1번째 질문" || publicReceipt.ReceiptToken == "" {
		t.Fatalf("unexpected public receipt: %+v", publicReceipt)
	}

	publicRecord, err := app.FindRecordById("ask_questions", publicReceipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if publicRecord.GetString("receipt_token_hash") == publicReceipt.ReceiptToken ||
		!verifyAskQuestionReceiptToken(publicRecord.GetString("receipt_token_hash"), publicReceipt.ReceiptToken) {
		t.Fatal("raw receipt token was stored or hash cannot verify it")
	}
	if publicRecord.GetString("private_password_hash") != "" {
		t.Fatal("public question stored an unnecessary password hash")
	}

	publicFeed, err := app.FindRecordById("ask_question_feed", publicReceipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if askQuestionViewString(publicFeed, "question") != "" || askQuestionViewString(publicFeed, "answer") != "" || askQuestionViewString(publicFeed, "status") != "pending" {
		t.Fatalf("pending feed leaked content: %+v", publicFeed)
	}

	publicRead := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"id":            publicReceipt.ID,
		"receipt_token": publicReceipt.ReceiptToken,
	}, "198.51.100.2:1002", "")
	assertAskQuestionResponse(t, publicRead, http.StatusOK, "공개 질문 원문", false, false)

	missingPassword := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question":   "비공개 질문",
		"is_private": true,
	}, "198.51.100.3:1003", "")
	if missingPassword.Code != http.StatusBadRequest {
		t.Fatalf("missing private password status=%d", missingPassword.Code)
	}
	blankPassword := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question":   "비공개 질문",
		"is_private": true,
		"password":   "   ",
	}, "198.51.100.3:1004", "")
	if blankPassword.Code != http.StatusBadRequest {
		t.Fatalf("blank private password status=%d", blankPassword.Code)
	}

	privatePassword := strings.Repeat("길이 제한 없는 비밀번호", 40)
	privateCreate := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionPath, map[string]any{
		"question":   "비공개 질문 원문",
		"is_private": true,
		"password":   privatePassword,
	}, "198.51.100.4:1005", "")
	if privateCreate.Code != http.StatusCreated {
		t.Fatalf("private create status=%d body=%s", privateCreate.Code, privateCreate.Body.String())
	}
	privateReceipt := decodeAskQuestionCreateResponse(t, privateCreate.Body.Bytes())
	privateRecord, err := app.FindRecordById("ask_questions", privateReceipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if privateRecord.GetString("private_password_hash") == privatePassword ||
		!verifyAskQuestionPassword(privateRecord.GetString("private_password_hash"), privatePassword) {
		t.Fatal("private password was stored raw or hash cannot verify it")
	}
	privateFeed, err := app.FindRecordById("ask_question_feed", privateReceipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if askQuestionViewString(privateFeed, "question") != "" || askQuestionViewString(privateFeed, "answer") != "" || askQuestionViewString(privateFeed, "status") != "private" {
		t.Fatal("private feed leaked content")
	}

	privateRead := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"sequence": privateReceipt.Sequence,
		"password": privatePassword,
	}, "198.51.100.5:1006", "")
	assertAskQuestionResponse(t, privateRead, http.StatusOK, "비공개 질문 원문", true, false)

	for attempt := 1; attempt <= askQuestionReadMaxFailures; attempt++ {
		wrongTarget := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
			"sequence": 1000 + attempt,
			"password": "wrong",
		}, "198.51.100.10:1011", "")
		if wrongTarget.Code != http.StatusNotFound {
			t.Fatalf("changed target attempt %d status=%d body=%s", attempt, wrongTarget.Code, wrongTarget.Body.String())
		}
	}
	changedTargetBlocked := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"id":       privateReceipt.ID,
		"password": "wrong",
	}, "198.51.100.10:1011", "")
	if changedTargetBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("changing target bypassed client-wide limit: status=%d body=%s", changedTargetBlocked.Code, changedTargetBlocked.Body.String())
	}
	malformedWhileBlocked := httptest.NewRequest(http.MethodPost, askQuestionReadPath, strings.NewReader("{"))
	malformedWhileBlocked.RemoteAddr = "198.51.100.10:1011"
	malformedWhileBlocked.Header.Set("Content-Type", "application/json")
	malformedResponse := httptest.NewRecorder()
	mux.ServeHTTP(malformedResponse, malformedWhileBlocked)
	if malformedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("blocked request parsed body before 429: status=%d body=%s", malformedResponse.Code, malformedResponse.Body.String())
	}
	validOtherTargetWhileBlocked := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"id":            publicReceipt.ID,
		"receipt_token": publicReceipt.ReceiptToken,
	}, "198.51.100.10:1011", "")
	if validOtherTargetWhileBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("valid other target bypassed client-wide limit: status=%d body=%s", validOtherTargetWhileBlocked.Code, validOtherTargetWhileBlocked.Body.String())
	}

	for attempt := 1; attempt <= askQuestionReadMaxFailures; attempt++ {
		wrong := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
			"sequence": privateReceipt.Sequence,
			"password": "wrong",
		}, "198.51.100.6:1007", "")
		if wrong.Code != http.StatusNotFound {
			t.Fatalf("wrong password attempt %d status=%d body=%s", attempt, wrong.Code, wrong.Body.String())
		}
	}
	sameIPValidOtherTarget := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"id":            publicReceipt.ID,
		"receipt_token": publicReceipt.ReceiptToken,
	}, "198.51.100.6:1007", "")
	if sameIPValidOtherTarget.Code != http.StatusTooManyRequests {
		t.Fatalf("valid read for another target bypassed the client-wide limit: status=%d", sameIPValidOtherTarget.Code)
	}
	finalWrong := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"sequence": privateReceipt.Sequence,
		"password": "wrong",
	}, "198.51.100.6:1007", "")
	if finalWrong.Code != http.StatusTooManyRequests {
		t.Fatalf("other target success bypassed rate limit: status=%d body=%s", finalWrong.Code, finalWrong.Body.String())
	}

	publicRecord.Set("answer", "공개 답변")
	publicRecord.Set("answered_at", types.NowDateTime())
	if err := app.Save(publicRecord); err != nil {
		t.Fatal(err)
	}
	ordered, err := app.FindRecordsByFilter("ask_question_feed", "", "-sequence", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(ordered) != 2 || ordered[0].GetInt("sequence") != 2 || ordered[1].GetInt("sequence") != 1 {
		t.Fatalf("answer changed question ordering: %+v", ordered)
	}

	ownerToken := createAskQuestionOwnerToken(t, app)
	deleted := askQuestionTestRequest(t, mux, http.MethodDelete, askQuestionPath+"/"+publicReceipt.ID, nil, "198.51.100.7:1008", ownerToken)
	if deleted.Code != http.StatusOK {
		t.Fatalf("soft delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	deletedRecord, err := app.FindRecordById("ask_questions", publicReceipt.ID)
	if err != nil {
		t.Fatal("soft delete hard-deleted the record")
	}
	if !deletedRecord.GetBool("deleted") || deletedRecord.GetString("question") != "" || deletedRecord.GetString("answer") != "" {
		t.Fatal("soft delete did not wipe raw question and answer")
	}
	if _, err := app.FindRecordById("ask_question_feed", publicReceipt.ID); err == nil {
		t.Fatal("deleted question remained in public feed")
	}
	renumberedPrivate, err := app.FindRecordById("ask_questions", privateReceipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got := renumberedPrivate.GetString("asker_name"); got != "1번째 질문" {
		t.Fatalf("remaining question name=%q want=%q", got, "1번째 질문")
	}
	privateReadAfterRenumber := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"sequence": 1,
		"password": privatePassword,
	}, "198.51.100.9:1010", "")
	assertAskQuestionResponse(t, privateReadAfterRenumber, http.StatusOK, "비공개 질문 원문", true, false)

	tombstone := askQuestionTestRequest(t, mux, http.MethodPost, askQuestionReadPath, map[string]any{
		"id":            publicReceipt.ID,
		"receipt_token": publicReceipt.ReceiptToken,
	}, "198.51.100.8:1009", "")
	assertAskQuestionResponse(t, tombstone, http.StatusOK, "", false, true)
}

type askQuestionCreateResponse struct {
	ID           string `json:"id"`
	Sequence     int    `json:"sequence"`
	AskerName    string `json:"asker_name"`
	ReceiptToken string `json:"receipt_token"`
}

func decodeAskQuestionCreateResponse(t *testing.T, raw []byte) askQuestionCreateResponse {
	t.Helper()
	result := askQuestionCreateResponse{}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func askQuestionTestRequest(t *testing.T, mux http.Handler, method, path string, body any, remoteAddr, authToken string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request := httptest.NewRequest(method, path, reader)
	request.RemoteAddr = remoteAddr
	request.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		request.Header.Set("Authorization", authToken)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func assertAskQuestionResponse(t *testing.T, response *httptest.ResponseRecorder, wantStatus int, wantQuestion string, wantPrivate, wantDeleted bool) {
	t.Helper()
	if response.Code != wantStatus {
		t.Fatalf("status=%d want=%d body=%s", response.Code, wantStatus, response.Body.String())
	}
	result := struct {
		Question  string `json:"question"`
		Created   string `json:"created"`
		IsPrivate bool   `json:"is_private"`
		Deleted   bool   `json:"deleted"`
	}{}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Created == "" || result.Question != wantQuestion || result.IsPrivate != wantPrivate || result.Deleted != wantDeleted {
		t.Fatalf("unexpected response: %+v", result)
	}
}

func askQuestionViewString(record *core.Record, field string) string {
	return strings.Trim(record.GetString(field), `"`)
}

func setupAskQuestionTestCollections(t *testing.T, app core.App) {
	t.Helper()
	questions := core.NewBaseCollection("ask_questions")
	questions.ListRule = types.Pointer("@request.auth.id != ''")
	questions.ViewRule = types.Pointer("@request.auth.id != ''")
	questions.UpdateRule = types.Pointer("@request.auth.id != ''")
	questions.Fields.Add(
		&core.NumberField{Name: "sequence", Required: true, OnlyInt: true},
		&core.TextField{Name: "asker_name", Required: true, Min: 1, Max: 100},
		&core.TextField{Name: "question", Max: 1000},
		&core.BoolField{Name: "is_private"},
		&core.TextField{Name: "answer", Max: 3000},
		&core.DateField{Name: "answered_at"},
		&core.TextField{Name: "receipt_token_hash", Max: 64, Pattern: "^[a-f0-9]{64}$", Hidden: true},
		&core.TextField{Name: "private_password_hash", Max: 255, Hidden: true},
		&core.BoolField{Name: "deleted"},
		&core.DateField{Name: "deleted_at"},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	questions.Indexes = append(questions.Indexes,
		"CREATE UNIQUE INDEX `idx_ask_questions_sequence` ON `ask_questions` (`sequence`)",
		"CREATE UNIQUE INDEX `idx_ask_questions_receipt_token_hash` ON `ask_questions` (`receipt_token_hash`) WHERE `receipt_token_hash` != ''",
	)
	if err := app.Save(questions); err != nil {
		t.Fatal(err)
	}

	counters := core.NewBaseCollection("ask_question_counters")
	counters.Fields.Add(
		&core.TextField{Name: "key", Required: true, Min: 1, Max: 50},
		&core.NumberField{Name: "value", OnlyInt: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	if err := app.Save(counters); err != nil {
		t.Fatal(err)
	}
	counter := core.NewRecord(counters)
	counter.Set("key", "global")
	counter.Set("value", 0)
	if err := app.Save(counter); err != nil {
		t.Fatal(err)
	}

	feed := core.NewViewCollection("ask_question_feed")
	feed.ListRule = types.Pointer("")
	feed.ViewRule = types.Pointer("")
	feed.ViewQuery = `
SELECT
  q.id AS id,
  q.sequence AS sequence,
  q.asker_name AS asker_name,
  q.created AS created,
  iif(q.is_private=TRUE,'private',iif(trim(COALESCE(q.answer,''))!='','answered','pending')) AS status,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.question,'') AS question,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answer,'') AS answer,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answered_at,'') AS answered_at
FROM ask_questions q
WHERE q.deleted = FALSE
`
	if err := app.Save(feed); err != nil {
		t.Fatal(err)
	}
}

func createAskQuestionOwnerToken(t *testing.T, app core.App) string {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal(err)
	}
	owner := core.NewRecord(collection)
	owner.Set("email", "ask-owner@example.com")
	owner.SetPassword("owner-password-123")
	if err := app.Save(owner); err != nil {
		t.Fatal(err)
	}
	token, err := owner.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}
