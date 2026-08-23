package main

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestDailyFirstPublishedAtLifecycle(t *testing.T) {
	firstPublish, err := types.ParseDateTime("2026-08-23 13:05:45.480Z")
	if err != nil {
		t.Fatal(err)
	}
	laterEdit, err := types.ParseDateTime("2026-08-23 13:45:12.401Z")
	if err != nil {
		t.Fatal(err)
	}

	t.Run("new published record receives server time", func(t *testing.T) {
		record := newDailyPublicationRecord()
		record.Set("status", dailyPublishedStatus)
		record.Set(dailyFirstPublishedAtField, laterEdit)

		enforceDailyFirstPublishedAt(record, nil, firstPublish)

		assertDailyPublicationTime(t, record, firstPublish)
	})

	t.Run("new draft cannot forge a publication time", func(t *testing.T) {
		record := newDailyPublicationRecord()
		record.Set("status", "draft")
		record.Set(dailyFirstPublishedAtField, laterEdit)

		enforceDailyFirstPublishedAt(record, nil, firstPublish)

		if !record.GetDateTime(dailyFirstPublishedAtField).IsZero() {
			t.Fatal("draft retained a forged first publication time")
		}
	})

	t.Run("draft to published transition records the first time", func(t *testing.T) {
		record := persistedDailyPublicationRecord(t, "draft", types.DateTime{})
		original := record.Original()
		record.Set("status", dailyPublishedStatus)

		enforceDailyFirstPublishedAt(record, original, firstPublish)

		assertDailyPublicationTime(t, record, firstPublish)
	})

	t.Run("published edits preserve the original time", func(t *testing.T) {
		record := persistedDailyPublicationRecord(t, dailyPublishedStatus, firstPublish)
		original := record.Original()
		record.Set(dailyFirstPublishedAtField, laterEdit)

		enforceDailyFirstPublishedAt(record, original, laterEdit)

		assertDailyPublicationTime(t, record, firstPublish)
	})

	t.Run("legacy published records stay on their migration fallback", func(t *testing.T) {
		record := persistedDailyPublicationRecord(t, dailyPublishedStatus, types.DateTime{})
		original := record.Original()
		record.Set(dailyFirstPublishedAtField, laterEdit)

		enforceDailyFirstPublishedAt(record, original, laterEdit)

		if !record.GetDateTime(dailyFirstPublishedAtField).IsZero() {
			t.Fatal("legacy published record was reordered by a later edit")
		}
	})
}

func TestDailyPublicationHooksPersistFirstTime(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	collection := core.NewBaseCollection(dailyEntriesCollection)
	collection.Fields.Add(
		&core.TextField{Name: "status"},
		&core.TextField{Name: "content"},
		&core.DateField{Name: dailyFirstPublishedAtField},
	)
	if err := app.Save(collection); err != nil {
		t.Fatal(err)
	}

	firstPublish, err := types.ParseDateTime("2026-08-23 13:05:45.480Z")
	if err != nil {
		t.Fatal(err)
	}
	laterEdit, err := types.ParseDateTime("2026-08-23 13:45:12.401Z")
	if err != nil {
		t.Fatal(err)
	}
	now := firstPublish
	registerDailyPublicationHooksWithClock(app, func() types.DateTime { return now })

	record := core.NewRecord(collection)
	record.Set("status", "draft")
	record.Set("content", "draft")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if !record.GetDateTime(dailyFirstPublishedAtField).IsZero() {
		t.Fatal("draft persistence stored a first publication time")
	}

	firstRequest, err := app.FindRecordById(dailyEntriesCollection, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	secondRequest, err := app.FindRecordById(dailyEntriesCollection, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	firstRequest.Set("status", dailyPublishedStatus)
	secondRequest.Set("status", dailyPublishedStatus)

	if err := app.Save(firstRequest); err != nil {
		t.Fatal(err)
	}
	assertDailyPublicationTime(t, firstRequest, firstPublish)

	now = laterEdit
	secondRequest.Set(dailyFirstPublishedAtField, laterEdit)
	if err := app.Save(secondRequest); err != nil {
		t.Fatal(err)
	}

	persisted, err := app.FindRecordById(dailyEntriesCollection, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	assertDailyPublicationTime(t, persisted, firstPublish)

	persisted.Set("content", "edited after publication")
	persisted.Set(dailyFirstPublishedAtField, laterEdit)
	if err := app.Save(persisted); err != nil {
		t.Fatal(err)
	}

	persisted, err = app.FindRecordById(dailyEntriesCollection, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	assertDailyPublicationTime(t, persisted, firstPublish)
}

func newDailyPublicationRecord() *core.Record {
	collection := core.NewBaseCollection(dailyEntriesCollection)
	collection.Fields.Add(
		&core.TextField{Name: "status"},
		&core.DateField{Name: dailyFirstPublishedAtField},
	)
	return core.NewRecord(collection)
}

func persistedDailyPublicationRecord(t *testing.T, status string, firstPublishedAt types.DateTime) *core.Record {
	t.Helper()
	record := newDailyPublicationRecord()
	record.Id = "dailyrecord0001"
	record.Set("status", status)
	record.Set(dailyFirstPublishedAtField, firstPublishedAt)
	if err := record.PostScan(); err != nil {
		t.Fatal(err)
	}
	return record
}

func assertDailyPublicationTime(t *testing.T, record *core.Record, want types.DateTime) {
	t.Helper()
	got := record.GetDateTime(dailyFirstPublishedAtField)
	if !got.Equal(want) {
		t.Fatalf("first publication time = %s, want %s", got.String(), want.String())
	}
}
