package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	chatGptSharePreviewPath  = "/api/cwk/chatgpt-share-preview"
	chatGptShareBodyMaxBytes = int64(8 * 1024)
	chatGptShareHTMLMaxBytes = int64(5 * 1024 * 1024)
	chatGptShareTextMaxBytes = 500 * 1024
	chatGptShareMessageMax   = 200
)

var chatGptSharePathPattern = regexp.MustCompile(`^/share/([a-zA-Z0-9_-]{16,128})/?$`)

type chatGptShareService struct {
	ownerUserID string
	client      *http.Client
}

type chatGptShareRequest struct {
	URL string `json:"url" form:"url"`
}

type chatGptShareSnapshot struct {
	Title    string                `json:"title"`
	Messages []chatGptShareMessage `json:"messages"`
}

type chatGptShareMessage struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type orderedChatGptMessage struct {
	chatGptShareMessage
	created float64
	id      string
}

func newChatGptShareService(ownerUserID string) *chatGptShareService {
	return &chatGptShareService{
		ownerUserID: ownerUserID,
		client: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return errors.New("redirects are not allowed")
			},
		},
	}
}

func (service *chatGptShareService) registerRoutes(e *core.ServeEvent) {
	e.Router.POST(chatGptSharePreviewPath, service.preview).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(chatGptShareBodyMaxBytes)).
		Bind(requireOwner(service.ownerUserID))
}

func (service *chatGptShareService) preview(e *core.RequestEvent) error {
	request := chatGptShareRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("ChatGPT 공유 링크 요청을 읽지 못했습니다.", err)
	}
	shareURL, err := normalizedChatGptShareURL(request.URL)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	httpRequest, err := http.NewRequestWithContext(e.Request.Context(), http.MethodGet, shareURL, nil)
	if err != nil {
		return e.BadRequestError("ChatGPT 공유 링크를 읽지 못했습니다.", err)
	}
	httpRequest.Header.Set("Accept", "text/html")
	httpRequest.Header.Set("User-Agent", "coldwaterkim.com ChatGPT share preview/1.0")
	response, err := service.client.Do(httpRequest)
	if err != nil {
		return e.BadRequestError("ChatGPT 공유 대화를 불러오지 못했습니다.", nil)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return e.BadRequestError("ChatGPT 공유 대화를 열 수 없습니다.", nil)
	}
	if !strings.Contains(strings.ToLower(response.Header.Get("Content-Type")), "text/html") {
		return e.BadRequestError("ChatGPT 공유 대화 응답 형식이 올바르지 않습니다.", nil)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, chatGptShareHTMLMaxBytes+1))
	if err != nil || int64(len(body)) > chatGptShareHTMLMaxBytes {
		return e.BadRequestError("ChatGPT 공유 대화가 너무 크거나 완전히 읽히지 않았습니다.", nil)
	}
	snapshot, err := decodeChatGptShareHTML(string(body))
	if err != nil {
		return e.BadRequestError("ChatGPT 공유 대화 내용을 해석하지 못했습니다.", nil)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("X-Content-Type-Options", "nosniff")
	return e.JSON(http.StatusOK, snapshot)
}

func normalizedChatGptShareURL(value string) (string, error) {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(value))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() != "chatgpt.com" || parsed.Port() != "" || parsed.User != nil {
		return "", errors.New("정확한 https://chatgpt.com/share/... 링크만 사용할 수 있습니다")
	}
	match := chatGptSharePathPattern.FindStringSubmatch(parsed.Path)
	if len(match) != 2 || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("정확한 https://chatgpt.com/share/... 링크만 사용할 수 있습니다")
	}
	return "https://chatgpt.com/share/" + match[1], nil
}

func decodeChatGptShareHTML(html string) (chatGptShareSnapshot, error) {
	payloads, err := chatGptRouterPayloads(html)
	if err != nil {
		return chatGptShareSnapshot{}, err
	}
	for _, payload := range payloads {
		values := []any{}
		if err := json.Unmarshal([]byte(payload), &values); err != nil || len(values) == 0 {
			continue
		}
		decoded, err := decodeChatGptTurboValues(values)
		if err != nil {
			continue
		}
		if snapshot, ok := chatGptSnapshotFromDecoded(decoded); ok {
			return snapshot, nil
		}
	}
	return chatGptShareSnapshot{}, errors.New("shared conversation payload not found")
}

func chatGptRouterPayloads(html string) ([]string, error) {
	const marker = `streamController.enqueue("`
	payloads := []string{}
	for offset := 0; ; {
		index := strings.Index(html[offset:], marker)
		if index < 0 {
			break
		}
		start := offset + index + len(marker)
		end := start
		escaped := false
		for end < len(html) {
			character := html[end]
			if character == '"' && !escaped {
				break
			}
			if character == '\\' && !escaped {
				escaped = true
			} else {
				escaped = false
			}
			end++
		}
		if end >= len(html) {
			return nil, errors.New("unterminated router payload")
		}
		var payload string
		if err := json.Unmarshal([]byte(`"`+html[start:end]+`"`), &payload); err == nil && strings.HasPrefix(payload, "[") {
			payloads = append(payloads, payload)
		}
		offset = end + 1
	}
	if len(payloads) == 0 {
		return nil, errors.New("router payload missing")
	}
	return payloads, nil
}

func decodeChatGptTurboValues(values []any) (any, error) {
	cache := map[int]any{}
	resolving := map[int]bool{}
	var decodeIndex func(int) (any, error)
	var decodeReference func(any) (any, error)
	decodeReference = func(reference any) (any, error) {
		number, ok := reference.(float64)
		if !ok || number != float64(int(number)) {
			return reference, nil
		}
		if number < 0 {
			return nil, nil
		}
		return decodeIndex(int(number))
	}
	decodeIndex = func(index int) (any, error) {
		if index < 0 || index >= len(values) {
			return nil, fmt.Errorf("turbo reference out of range")
		}
		if cached, ok := cache[index]; ok {
			return cached, nil
		}
		if resolving[index] {
			return nil, nil
		}
		if len(resolving) > 512 {
			return nil, fmt.Errorf("turbo payload nesting is too deep")
		}
		value := values[index]
		switch typed := value.(type) {
		case []any:
			resolving[index] = true
			defer delete(resolving, index)
			output := make([]any, 0, len(typed))
			for _, item := range typed {
				decoded, err := decodeReference(item)
				if err != nil {
					return nil, err
				}
				output = append(output, decoded)
			}
			cache[index] = output
			return output, nil
		case map[string]any:
			output := map[string]any{}
			cache[index] = output
			for encodedKey, encodedValue := range typed {
				keyIndex, err := strconv.Atoi(strings.TrimPrefix(encodedKey, "_"))
				if err != nil || !strings.HasPrefix(encodedKey, "_") {
					return nil, fmt.Errorf("invalid turbo key")
				}
				keyValue, err := decodeIndex(keyIndex)
				if err != nil {
					return nil, err
				}
				key, ok := keyValue.(string)
				if !ok {
					return nil, fmt.Errorf("invalid turbo key type")
				}
				decoded, err := decodeReference(encodedValue)
				if err != nil {
					return nil, err
				}
				output[key] = decoded
			}
			return output, nil
		default:
			return value, nil
		}
	}
	return decodeIndex(0)
}

func chatGptSnapshotFromDecoded(decoded any) (chatGptShareSnapshot, bool) {
	root, ok := decoded.(map[string]any)
	if !ok {
		return chatGptShareSnapshot{}, false
	}
	loader, _ := root["loaderData"].(map[string]any)
	route, _ := loader["routes/share.$shareId.($action)"].(map[string]any)
	serverResponse, _ := route["serverResponse"].(map[string]any)
	data, _ := serverResponse["data"].(map[string]any)
	mapping, _ := data["mapping"].(map[string]any)
	if len(mapping) == 0 {
		return chatGptShareSnapshot{}, false
	}

	ordered := make([]orderedChatGptMessage, 0, len(mapping))
	for id, rawNode := range mapping {
		node, _ := rawNode.(map[string]any)
		message, _ := node["message"].(map[string]any)
		author, _ := message["author"].(map[string]any)
		role, _ := author["role"].(string)
		if role != "user" && role != "assistant" {
			continue
		}
		recipient := stringValue(message["recipient"])
		if recipient != "" && recipient != "all" {
			continue
		}
		channel := stringValue(message["channel"])
		if role == "assistant" && channel != "" && channel != "final" {
			continue
		}
		metadata, _ := message["metadata"].(map[string]any)
		if hidden, _ := metadata["is_visually_hidden_from_conversation"].(bool); hidden {
			continue
		}
		content, _ := message["content"].(map[string]any)
		text := chatGptMessageText(content)
		if text == "" {
			continue
		}
		created, _ := message["create_time"].(float64)
		ordered = append(ordered, orderedChatGptMessage{
			chatGptShareMessage: chatGptShareMessage{Role: role, Text: text},
			created:             created,
			id:                  id,
		})
	}
	sort.SliceStable(ordered, func(left, right int) bool {
		if ordered[left].created == ordered[right].created {
			return ordered[left].id < ordered[right].id
		}
		return ordered[left].created < ordered[right].created
	})

	messages := make([]chatGptShareMessage, 0, len(ordered))
	totalBytes := 0
	for _, item := range ordered {
		if len(messages) >= chatGptShareMessageMax || totalBytes+len(item.Text) > chatGptShareTextMaxBytes {
			break
		}
		messages = append(messages, item.chatGptShareMessage)
		totalBytes += len(item.Text)
	}
	if len(messages) == 0 {
		return chatGptShareSnapshot{}, false
	}
	title := strings.TrimSpace(stringValue(data["title"]))
	if title == "" {
		title = "ChatGPT 공유 대화"
	}
	if len([]rune(title)) > 200 {
		title = string([]rune(title)[:200])
	}
	return chatGptShareSnapshot{Title: title, Messages: messages}, true
}

func chatGptMessageText(content map[string]any) string {
	contentType := stringValue(content["content_type"])
	if contentType != "text" && contentType != "multimodal_text" {
		return ""
	}
	parts, _ := content["parts"].([]any)
	texts := make([]string, 0, len(parts)+1)
	for _, part := range parts {
		switch typed := part.(type) {
		case string:
			texts = append(texts, typed)
		case map[string]any:
			if text := stringValue(typed["text"]); text != "" {
				texts = append(texts, text)
			}
		}
	}
	if text := stringValue(content["text"]); len(texts) == 0 && text != "" {
		texts = append(texts, text)
	}
	return strings.TrimSpace(strings.Join(texts, "\n"))
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}
