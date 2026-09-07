package main

import (
	"database/sql"
	"errors"
	"github.com/pocketbase/pocketbase/core"
	"net/http"
)

// Retire public endpoints without deleting historical questions or tool records.
// Superusers retain database access for export and recovery.
func ensureRetiredSections(app core.App) error {
	return app.RunInTransaction(func(tx core.App) error {
		for _, name := range []string{"ask_questions", "ask_question_feed", "ask_question_counters", "programs"} {
			c, err := tx.FindCollectionByNameOrId(name)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return err
			}
			if c.ListRule == nil && c.ViewRule == nil && c.CreateRule == nil && c.UpdateRule == nil && c.DeleteRule == nil {
				continue
			}
			c.ListRule = nil
			c.ViewRule = nil
			c.CreateRule = nil
			c.UpdateRule = nil
			c.DeleteRule = nil
			if err = tx.Save(c); err != nil {
				return err
			}
		}
		return nil
	})
}

// Explicit methods keep retired API requests out of the GET SPA catch-all.
func registerRetiredSectionRoutes(e *core.ServeEvent) {
	gone := func(event *core.RequestEvent) error {
		return event.JSON(http.StatusGone, map[string]string{"message": "이 기능은 종료되었어. 피드를 이용해 줘."})
	}
	for _, prefix := range []string{"/api/cwk/ask", "/api/cwk/tools"} {
		for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions} {
			e.Router.Route(method, prefix, gone)
			e.Router.Route(method, prefix+"/{path...}", gone)
		}
	}
}
