package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

type chatGptRoundTripFunc func(*http.Request) (*http.Response, error)

func (function chatGptRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestNormalizedChatGptShareURL(t *testing.T) {
	valid := "https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701"
	if normalized, err := normalizedChatGptShareURL(valid); err != nil || normalized != valid {
		t.Fatalf("normalized=%q err=%v", normalized, err)
	}
	for _, invalid := range []string{
		"http://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701",
		"https://evil.example/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701",
		"https://chatgpt.com:444/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701",
		"https://user@chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701",
		"https://chatgpt.com/share/short",
		"https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701?next=http://127.0.0.1",
	} {
		if _, err := normalizedChatGptShareURL(invalid); err == nil {
			t.Fatalf("unsafe URL accepted: %s", invalid)
		}
	}
}

func TestDecodeChatGptShareHTML(t *testing.T) {
	decoded := map[string]any{
		"loaderData": map[string]any{
			"routes/share.$shareId.($action)": map[string]any{
				"serverResponse": map[string]any{
					"data": map[string]any{
						"title": "공유 대화 제목",
						"mapping": map[string]any{
							"first": map[string]any{"message": map[string]any{
								"author": map[string]any{"role": "user"}, "create_time": float64(1),
								"content": map[string]any{"content_type": "text", "parts": []any{"질문입니다"}},
							}},
							"hidden": map[string]any{"message": map[string]any{
								"author": map[string]any{"role": "assistant"}, "create_time": float64(2),
								"metadata": map[string]any{"is_visually_hidden_from_conversation": true},
								"content":  map[string]any{"content_type": "text", "parts": []any{"숨겨진 내용"}},
							}},
							"last": map[string]any{"message": map[string]any{
								"author": map[string]any{"role": "assistant"}, "create_time": float64(3),
								"content": map[string]any{"content_type": "text", "parts": []any{"답변입니다"}},
							}},
						},
					},
				},
			},
		},
	}
	values := encodeChatGptTurboFixture(decoded)
	payload, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	quoted, err := json.Marshal(string(payload))
	if err != nil {
		t.Fatal(err)
	}
	html := `<script>window.__reactRouterContext.streamController.enqueue(` + string(quoted) + `)</script>`
	snapshot, err := decodeChatGptShareHTML(html)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Title != "공유 대화 제목" || len(snapshot.Messages) != 2 {
		t.Fatalf("snapshot=%+v", snapshot)
	}
	if snapshot.Messages[0].Role != "user" || snapshot.Messages[0].Text != "질문입니다" {
		t.Fatalf("first=%+v", snapshot.Messages[0])
	}
	if snapshot.Messages[1].Role != "assistant" || snapshot.Messages[1].Text != "답변입니다" {
		t.Fatalf("last=%+v", snapshot.Messages[1])
	}
}

func TestChatGptSharePreviewRouteRequiresOwnerAndReturnsSnapshot(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	owner, ownerToken := createChatGptAuthRecord(t, app, users, "eeeeeeeeeeeeeee", "chat-owner@example.com")
	_, otherToken := createChatGptAuthRecord(t, app, users, "fffffffffffffff", "chat-other@example.com")

	fixture := map[string]any{
		"loaderData": map[string]any{
			"routes/share.$shareId.($action)": map[string]any{
				"serverResponse": map[string]any{"data": map[string]any{
					"title": "테스트 대화",
					"mapping": map[string]any{"one": map[string]any{"message": map[string]any{
						"author": map[string]any{"role": "user"}, "create_time": float64(1),
						"content": map[string]any{"content_type": "text", "parts": []any{"안녕"}},
					}}},
				}},
			},
		},
	}
	values := encodeChatGptTurboFixture(fixture)
	payload, _ := json.Marshal(values)
	quoted, _ := json.Marshal(string(payload))
	html := `<script>window.__reactRouterContext.streamController.enqueue(` + string(quoted) + `)</script>`
	service := newChatGptShareService(owner.Id)
	service.client = &http.Client{Transport: chatGptRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701" {
			t.Fatalf("unexpected URL: %s", request.URL)
		}
		if request.Header.Get("Authorization") != "" || request.Header.Get("Cookie") != "" {
			t.Fatal("owner credentials leaked to ChatGPT")
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"text/html; charset=utf-8"}},
			Body:       io.NopCloser(bytes.NewBufferString(html)),
			Request:    request,
		}, nil
	})}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	body := `{"url":"https://chatgpt.com/share/6a901ff4-0b9c-83e9-b058-8ecd80b68701"}`
	for _, testCase := range []struct {
		name   string
		token  string
		status int
	}{
		{name: "anonymous", status: http.StatusUnauthorized},
		{name: "other user", token: otherToken, status: http.StatusForbidden},
		{name: "owner", token: ownerToken, status: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, chatGptSharePreviewPath, bytes.NewBufferString(body))
			request.Header.Set("Content-Type", "application/json")
			if testCase.token != "" {
				request.Header.Set("Authorization", testCase.token)
			}
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			if response.Code != testCase.status {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			if testCase.status == http.StatusOK && response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("missing no-store: %v", response.Header())
			}
		})
	}
}

func createChatGptAuthRecord(t *testing.T, app core.App, collection *core.Collection, id, email string) (*core.Record, string) {
	t.Helper()
	record := core.NewRecord(collection)
	record.Id = id
	record.Set("email", email)
	record.SetPassword("chatgpt-share-password-123")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return record, token
}

func encodeChatGptTurboFixture(root any) []any {
	values := []any{nil}
	var encode func(any, *int) int
	encode = func(value any, forced *int) int {
		index := len(values)
		if forced != nil {
			index = *forced
		} else {
			values = append(values, nil)
		}
		switch typed := value.(type) {
		case map[string]any:
			output := map[string]any{}
			values[index] = output
			for key, item := range typed {
				keyIndex := encode(key, nil)
				output["_"+strconv.Itoa(keyIndex)] = float64(encode(item, nil))
			}
		case []any:
			output := make([]any, 0, len(typed))
			for _, item := range typed {
				output = append(output, float64(encode(item, nil)))
			}
			values[index] = output
		default:
			values[index] = value
		}
		return index
	}
	rootIndex := 0
	encode(root, &rootIndex)
	return values
}
