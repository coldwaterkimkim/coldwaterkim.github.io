package main

import (
	"strings"
	"sync"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const firstPublishedAtField = "first_published_at"

type publicationRule struct {
	collection string
	isPublic   func(*core.Record) bool
}

var publicationRules = []publicationRule{
	{
		collection: "posts",
		isPublic: func(record *core.Record) bool {
			return record.GetString("status") == "published"
		},
	},
	{
		collection: "daily_entries",
		isPublic: func(record *core.Record) bool {
			return record.GetString("status") == "published"
		},
	},
	{
		collection: "programs",
		isPublic: func(record *core.Record) bool {
			return record.GetBool("is_public")
		},
	},
	{
		collection: "nasajab",
		isPublic: func(record *core.Record) bool {
			return record.GetBool("is_public")
		},
	},
	{
		collection: "guestbook",
		isPublic: func(record *core.Record) bool {
			return strings.TrimSpace(record.GetString("owner_reply")) != ""
		},
	},
}

func registerPublicationHooks(app core.App) {
	registerPublicationHooksWithClock(app, types.NowDateTime)
}

func registerPublicationHooksWithClock(app core.App, now func() types.DateTime) {
	var updateLock sync.Mutex

	for _, rule := range publicationRules {
		rule := rule

		app.OnRecordCreate(rule.collection).BindFunc(func(e *core.RecordEvent) error {
			enforceFirstPublishedAt(e.Record, nil, rule.isPublic, now())
			return e.Next()
		})

		app.OnRecordUpdate(rule.collection).BindFunc(func(e *core.RecordEvent) error {
			updateLock.Lock()
			defer updateLock.Unlock()

			original, err := e.App.FindRecordById(rule.collection, e.Record.Id)
			if err != nil {
				return err
			}
			enforceFirstPublishedAt(e.Record, original, rule.isPublic, now())
			return e.Next()
		})
	}
}

func enforceFirstPublishedAt(
	record *core.Record,
	original *core.Record,
	isPublic func(*core.Record) bool,
	now types.DateTime,
) {
	if record.IsNew() {
		record.Set(firstPublishedAtField, types.DateTime{})
		if isPublic(record) {
			record.Set(firstPublishedAtField, now)
		}
		return
	}

	originalFirstPublishedAt := original.GetDateTime(firstPublishedAtField)
	record.Set(firstPublishedAtField, originalFirstPublishedAt)

	if originalFirstPublishedAt.IsZero() && !isPublic(original) && isPublic(record) {
		record.Set(firstPublishedAtField, now)
	}
}
