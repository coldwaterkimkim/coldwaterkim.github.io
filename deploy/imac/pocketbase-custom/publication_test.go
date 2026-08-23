package main

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

func TestFirstPublishedAtLifecycle(t *testing.T) {
	firstPublish := mustPublicationTime(t, "2026-08-23 13:05:45.480Z")
	laterEdit := mustPublicationTime(t, "2026-08-23 13:45:12.401Z")

	for _, rule := range publicationRules {
		rule := rule
		t.Run(rule.collection, func(t *testing.T) {
			t.Run("new public record receives server time", func(t *testing.T) {
				record := newPublicationRecord(rule.collection)
				setPublicationState(record, rule.collection, true)
				record.Set(firstPublishedAtField, laterEdit)

				enforceFirstPublishedAt(record, nil, rule.isPublic, firstPublish)

				assertPublicationTime(t, record, firstPublish)
			})

			t.Run("new private record cannot forge a publication time", func(t *testing.T) {
				record := newPublicationRecord(rule.collection)
				setPublicationState(record, rule.collection, false)
				record.Set(firstPublishedAtField, laterEdit)

				enforceFirstPublishedAt(record, nil, rule.isPublic, firstPublish)

				if !record.GetDateTime(firstPublishedAtField).IsZero() {
					t.Fatal("private record retained a forged first publication time")
				}
			})

			t.Run("private to public transition records the first time", func(t *testing.T) {
				record := persistedPublicationRecord(t, rule.collection, false, types.DateTime{})
				original := record.Original()
				setPublicationState(record, rule.collection, true)

				enforceFirstPublishedAt(record, original, rule.isPublic, firstPublish)

				assertPublicationTime(t, record, firstPublish)
			})

			t.Run("public edits preserve the original time", func(t *testing.T) {
				record := persistedPublicationRecord(t, rule.collection, true, firstPublish)
				original := record.Original()
				record.Set(firstPublishedAtField, laterEdit)

				enforceFirstPublishedAt(record, original, rule.isPublic, laterEdit)

				assertPublicationTime(t, record, firstPublish)
			})

			t.Run("legacy public records stay on their migration fallback", func(t *testing.T) {
				record := persistedPublicationRecord(t, rule.collection, true, types.DateTime{})
				original := record.Original()
				record.Set(firstPublishedAtField, laterEdit)

				enforceFirstPublishedAt(record, original, rule.isPublic, laterEdit)

				if !record.GetDateTime(firstPublishedAtField).IsZero() {
					t.Fatal("legacy public record was reordered by a later edit")
				}
			})
		})
	}
}

func TestPublicationHooksPersistFirstTime(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	for _, rule := range publicationRules {
		collection := core.NewBaseCollection(rule.collection)
		collection.Fields.Add(
			&core.TextField{Name: "status"},
			&core.BoolField{Name: "is_public"},
			&core.TextField{Name: "owner_reply"},
			&core.TextField{Name: "content"},
			&core.DateField{Name: firstPublishedAtField},
		)
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}

	firstPublish := mustPublicationTime(t, "2026-08-23 13:05:45.480Z")
	laterEdit := mustPublicationTime(t, "2026-08-23 13:45:12.401Z")
	now := firstPublish
	registerPublicationHooksWithClock(app, func() types.DateTime { return now })

	for _, rule := range publicationRules {
		rule := rule
		t.Run(rule.collection, func(t *testing.T) {
			collection, err := app.FindCollectionByNameOrId(rule.collection)
			if err != nil {
				t.Fatal(err)
			}

			record := core.NewRecord(collection)
			setPublicationState(record, rule.collection, false)
			record.Set("content", "private")
			if err := app.Save(record); err != nil {
				t.Fatal(err)
			}
			if !record.GetDateTime(firstPublishedAtField).IsZero() {
				t.Fatal("private persistence stored a first publication time")
			}

			firstRequest, err := app.FindRecordById(rule.collection, record.Id)
			if err != nil {
				t.Fatal(err)
			}
			secondRequest, err := app.FindRecordById(rule.collection, record.Id)
			if err != nil {
				t.Fatal(err)
			}
			setPublicationState(firstRequest, rule.collection, true)
			setPublicationState(secondRequest, rule.collection, true)

			now = firstPublish
			if err := app.Save(firstRequest); err != nil {
				t.Fatal(err)
			}
			assertPublicationTime(t, firstRequest, firstPublish)

			now = laterEdit
			secondRequest.Set(firstPublishedAtField, laterEdit)
			if err := app.Save(secondRequest); err != nil {
				t.Fatal(err)
			}

			persisted, err := app.FindRecordById(rule.collection, record.Id)
			if err != nil {
				t.Fatal(err)
			}
			assertPublicationTime(t, persisted, firstPublish)

			persisted.Set("content", "edited after publication")
			persisted.Set(firstPublishedAtField, laterEdit)
			if err := app.Save(persisted); err != nil {
				t.Fatal(err)
			}

			persisted, err = app.FindRecordById(rule.collection, record.Id)
			if err != nil {
				t.Fatal(err)
			}
			assertPublicationTime(t, persisted, firstPublish)
		})
	}
}

func newPublicationRecord(collectionName string) *core.Record {
	collection := core.NewBaseCollection(collectionName)
	collection.Fields.Add(
		&core.TextField{Name: "status"},
		&core.BoolField{Name: "is_public"},
		&core.TextField{Name: "owner_reply"},
		&core.DateField{Name: firstPublishedAtField},
	)
	return core.NewRecord(collection)
}

func persistedPublicationRecord(
	t *testing.T,
	collectionName string,
	isPublic bool,
	firstPublishedAt types.DateTime,
) *core.Record {
	t.Helper()
	record := newPublicationRecord(collectionName)
	record.Id = "record000000001"
	setPublicationState(record, collectionName, isPublic)
	record.Set(firstPublishedAtField, firstPublishedAt)
	if err := record.PostScan(); err != nil {
		t.Fatal(err)
	}
	return record
}

func setPublicationState(record *core.Record, collectionName string, isPublic bool) {
	switch collectionName {
	case "posts", "daily_entries":
		if isPublic {
			record.Set("status", "published")
		} else {
			record.Set("status", "draft")
		}
	case "programs", "nasajab":
		record.Set("is_public", isPublic)
	case "guestbook":
		if isPublic {
			record.Set("owner_reply", "published owner reply")
		} else {
			record.Set("owner_reply", "")
		}
	}
}

func mustPublicationTime(t *testing.T, value string) types.DateTime {
	t.Helper()
	parsed, err := types.ParseDateTime(value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func assertPublicationTime(t *testing.T, record *core.Record, want types.DateTime) {
	t.Helper()
	got := record.GetDateTime(firstPublishedAtField)
	if !got.Equal(want) {
		t.Fatalf("first publication time = %s, want %s", got.String(), want.String())
	}
}
