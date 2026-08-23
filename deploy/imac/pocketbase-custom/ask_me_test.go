package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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
	limiter := newAskQuestionReadLimiter(3, time.Minute)
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
	limiter.fail("client", now.Add(2*time.Minute))
	limiter.success("client")
	if limiter.blocked("client", now.Add(2*time.Minute)) {
		t.Fatal("successful authentication did not clear failures")
	}

	limiter.fail("client|sequence:1", now)
	limiter.fail("client|sequence:1", now)
	limiter.success("client|sequence:2")
	if !limiter.fail("client|sequence:1", now) {
		t.Fatal("success for another target cleared this target's failures")
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

	for attempt := 1; attempt < askQuestionReadMaxFailures; attempt++ {
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
	if sameIPValidOtherTarget.Code != http.StatusOK {
		t.Fatalf("valid read for another target status=%d", sameIPValidOtherTarget.Code)
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
