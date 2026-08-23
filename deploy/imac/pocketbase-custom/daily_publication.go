package main

import (
	"sync"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	dailyEntriesCollection     = "daily_entries"
	dailyFirstPublishedAtField = "first_published_at"
	dailyPublishedStatus       = "published"
)

func registerDailyPublicationHooks(app core.App) {
	registerDailyPublicationHooksWithClock(app, types.NowDateTime)
}

func registerDailyPublicationHooksWithClock(app core.App, now func() types.DateTime) {
	var updateLock sync.Mutex

	app.OnRecordCreate(dailyEntriesCollection).BindFunc(func(e *core.RecordEvent) error {
		enforceDailyFirstPublishedAt(e.Record, nil, now())
		return e.Next()
	})

	app.OnRecordUpdate(dailyEntriesCollection).BindFunc(func(e *core.RecordEvent) error {
		updateLock.Lock()
		defer updateLock.Unlock()

		original, err := e.App.FindRecordById(dailyEntriesCollection, e.Record.Id)
		if err != nil {
			return err
		}
		enforceDailyFirstPublishedAt(e.Record, original, now())
		return e.Next()
	})
}

func enforceDailyFirstPublishedAt(record *core.Record, original *core.Record, now types.DateTime) {
	if record.IsNew() {
		record.Set(dailyFirstPublishedAtField, types.DateTime{})
		if record.GetString("status") == dailyPublishedStatus {
			record.Set(dailyFirstPublishedAtField, now)
		}
		return
	}

	originalFirstPublishedAt := original.GetDateTime(dailyFirstPublishedAtField)
	record.Set(dailyFirstPublishedAtField, originalFirstPublishedAt)

	if originalFirstPublishedAt.IsZero() &&
		original.GetString("status") != dailyPublishedStatus &&
		record.GetString("status") == dailyPublishedStatus {
		record.Set(dailyFirstPublishedAtField, now)
	}
}
