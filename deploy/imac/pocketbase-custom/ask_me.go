package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	askQuestionPath         = "/api/cwk/ask/questions"
	askQuestionBodyMaxBytes = int64(8 * 1024)
	askQuestionMaxRunes     = 1000
)

var koreaStandardTime = time.FixedZone("KST", 9*60*60)

type askQuestionService struct {
	app core.App
}

type askQuestionRequest struct {
	Question  string `json:"question" form:"question"`
	IsPrivate bool   `json:"is_private" form:"is_private"`
	Honeypot  string `json:"website" form:"website"`
}

func newAskQuestionService(app core.App) *askQuestionService {
	return &askQuestionService{app: app}
}

func (service *askQuestionService) registerRoutes(e *core.ServeEvent) {
	e.Router.POST(askQuestionPath, service.createQuestion).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(askQuestionBodyMaxBytes))
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

	var response map[string]any
	err := service.app.RunInTransaction(func(txApp core.App) error {
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
		record.Set("asker_name", askQuestionAskerName(time.Now(), sequence))
		record.Set("question", question)
		record.Set("is_private", request.IsPrivate)
		if err := txApp.Save(record); err != nil {
			return fmt.Errorf("save ask question: %w", err)
		}

		status := "pending"
		if request.IsPrivate {
			status = "private"
		}
		response = map[string]any{
			"accepted":   true,
			"id":         record.Id,
			"sequence":   sequence,
			"asker_name": record.GetString("asker_name"),
			"status":     status,
			"created":    record.GetDateTime("created"),
		}

		return nil
	})
	if err != nil {
		return e.InternalServerError("질문을 저장하지 못했습니다.", err)
	}

	return e.JSON(http.StatusCreated, response)
}

func askQuestionAskerName(at time.Time, sequence int) string {
	hour := at.In(koreaStandardTime).Hour()
	var modifier string

	switch {
	case hour >= 5 && hour <= 6:
		modifier = "너무 일찍 깬"
	case hour >= 7 && hour <= 9:
		modifier = "정신 차리는"
	case hour >= 10 && hour <= 12:
		modifier = "배고픈"
	case hour >= 13 && hour <= 16:
		modifier = "딴짓 중인"
	case hour >= 17 && hour <= 19:
		modifier = "할 말 생긴"
	case hour >= 20 && hour <= 22:
		modifier = "오늘이 아쉬운"
	case hour == 23 || hour <= 1:
		modifier = "잠 안 자는"
	default:
		modifier = "진짜 안 자는"
	}

	return fmt.Sprintf("%s 질문자 %d", modifier, sequence)
}
