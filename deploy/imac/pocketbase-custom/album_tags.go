package main

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"golang.org/x/text/unicode/norm"
)

const (
	albumTagsPath        = "/api/cwk/album/tags"
	albumTagPath         = "/api/cwk/album/tags/{id}"
	albumTagBatchPath    = "/api/cwk/album/tags/batch"
	albumTagBodyMaxBytes = int64(256 * 1024)
	albumTagMaxRunes     = 30
	albumTagMaxCount     = 50
	albumTagBatchMax     = 1000
)

var albumMediaKeyPattern = regexp.MustCompile(`^(media|nasajab):[a-z0-9]{15}$`)

type albumTagService struct {
	app core.App
}

type albumTagRequest struct {
	Name string `json:"name" form:"name"`
}

type albumTagBatchRequest struct {
	MediaKeys []string `json:"media_keys" form:"media_keys"`
	TagID     string   `json:"tag_id" form:"tag_id"`
	Action    string   `json:"action" form:"action"`
}

func newAlbumTagService(app core.App) *albumTagService {
	return &albumTagService{app: app}
}

func (service *albumTagService) registerRoutes(e *core.ServeEvent) {
	e.Router.POST(albumTagsPath, service.createTag).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(albumTagBodyMaxBytes)).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
	e.Router.PATCH(albumTagPath, service.renameTag).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(albumTagBodyMaxBytes)).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
	e.Router.DELETE(albumTagPath, service.deleteTag).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
	e.Router.POST(albumTagBatchPath, service.batchTag).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(albumTagBodyMaxBytes)).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
}

func (service *albumTagService) createTag(e *core.RequestEvent) error {
	request := albumTagRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("태그를 읽지 못했습니다.", err)
	}
	name := normalizeAlbumTagName(request.Name)
	if err := validateAlbumTagName(name); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	var created *core.Record
	err := service.app.RunInTransaction(func(txApp core.App) error {
		if count, err := txApp.CountRecords("album_tags"); err != nil {
			return fmt.Errorf("count album tags: %w", err)
		} else if count >= albumTagMaxCount {
			return fmt.Errorf("태그는 최대 %d개까지 만들 수 있습니다", albumTagMaxCount)
		}
		if _, err := txApp.FindFirstRecordByFilter("album_tags", "name={:name}", dbx.Params{"name": name}); err == nil {
			return fmt.Errorf("이미 있는 태그입니다")
		} else if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("find duplicate album tag: %w", err)
		}

		position := 1
		last, err := txApp.FindRecordsByFilter("album_tags", "", "-position,-created", 1, 0)
		if err != nil {
			return fmt.Errorf("find album tag position: %w", err)
		}
		if len(last) > 0 {
			position = last[0].GetInt("position") + 1
		}

		collection, err := txApp.FindCollectionByNameOrId("album_tags")
		if err != nil {
			return fmt.Errorf("find album tags collection: %w", err)
		}
		created = core.NewRecord(collection)
		created.Set("name", name)
		created.Set("position", position)
		if err := txApp.Save(created); err != nil {
			return fmt.Errorf("save album tag: %w", err)
		}
		return nil
	})
	if err != nil {
		return e.BadRequestError(err.Error(), err)
	}

	return e.JSON(http.StatusCreated, albumTagResponse(created, 0))
}

func (service *albumTagService) renameTag(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	request := albumTagRequest{}
	if !isPocketBaseRecordID(id) {
		return e.NotFoundError("태그를 찾지 못했습니다.", nil)
	}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("태그를 읽지 못했습니다.", err)
	}
	name := normalizeAlbumTagName(request.Name)
	if err := validateAlbumTagName(name); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	var updated *core.Record
	err := service.app.RunInTransaction(func(txApp core.App) error {
		record, err := txApp.FindRecordById("album_tags", id)
		if err != nil {
			return err
		}
		duplicate, err := txApp.FindFirstRecordByFilter(
			"album_tags",
			"name={:name} && id!={:id}",
			dbx.Params{"name": name, "id": id},
		)
		if err == nil && duplicate != nil {
			return fmt.Errorf("이미 있는 태그입니다")
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("find duplicate album tag: %w", err)
		}
		record.Set("name", name)
		if err := txApp.Save(record); err != nil {
			return fmt.Errorf("save album tag: %w", err)
		}
		updated = record
		return nil
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return e.NotFoundError("태그를 찾지 못했습니다.", nil)
		}
		return e.BadRequestError(err.Error(), err)
	}

	count, _ := service.app.CountRecords("album_media_tags", dbx.HashExp{"tag_id": id})
	return e.JSON(http.StatusOK, albumTagResponse(updated, count))
}

func (service *albumTagService) deleteTag(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	if !isPocketBaseRecordID(id) {
		return e.NotFoundError("태그를 찾지 못했습니다.", nil)
	}

	removed := 0
	err := service.app.RunInTransaction(func(txApp core.App) error {
		tag, err := txApp.FindRecordById("album_tags", id)
		if err != nil {
			return err
		}
		assignments, err := txApp.FindRecordsByFilter(
			"album_media_tags",
			"tag_id={:tagId}",
			"",
			0,
			0,
			dbx.Params{"tagId": id},
		)
		if err != nil {
			return fmt.Errorf("find album tag assignments: %w", err)
		}
		for _, assignment := range assignments {
			if err := txApp.Delete(assignment); err != nil {
				return fmt.Errorf("delete album tag assignment: %w", err)
			}
			removed++
		}
		if err := txApp.Delete(tag); err != nil {
			return fmt.Errorf("delete album tag: %w", err)
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return e.NotFoundError("태그를 찾지 못했습니다.", nil)
		}
		return e.InternalServerError("태그를 삭제하지 못했습니다.", err)
	}

	return e.JSON(http.StatusOK, map[string]any{
		"id":                  id,
		"deleted":             true,
		"removed_assignments": removed,
	})
}

func (service *albumTagService) batchTag(e *core.RequestEvent) error {
	request := albumTagBatchRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("선택한 미디어를 읽지 못했습니다.", err)
	}
	tagID := strings.TrimSpace(request.TagID)
	action := strings.ToLower(strings.TrimSpace(request.Action))
	if !isPocketBaseRecordID(tagID) {
		return e.BadRequestError("유효한 태그가 아닙니다.", nil)
	}
	if action != "add" && action != "remove" {
		return e.BadRequestError("지원하지 않는 태그 작업입니다.", nil)
	}
	mediaKeys, err := normalizeAlbumMediaKeys(request.MediaKeys)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}

	changed := 0
	err = service.app.RunInTransaction(func(txApp core.App) error {
		if _, err := txApp.FindRecordById("album_tags", tagID); err != nil {
			return fmt.Errorf("find album tag: %w", err)
		}
		collection, err := txApp.FindCollectionByNameOrId("album_media_tags")
		if err != nil {
			return fmt.Errorf("find album media tags collection: %w", err)
		}
		for _, mediaKey := range mediaKeys {
			if err := ensureAlbumMediaRecordExists(txApp, mediaKey); err != nil {
				return err
			}
			existing, findErr := txApp.FindFirstRecordByFilter(
				"album_media_tags",
				"media_key={:mediaKey} && tag_id={:tagId}",
				dbx.Params{"mediaKey": mediaKey, "tagId": tagID},
			)
			if action == "add" {
				if findErr == nil {
					continue
				}
				if !errors.Is(findErr, sql.ErrNoRows) {
					return fmt.Errorf("find album tag assignment: %w", findErr)
				}
				record := core.NewRecord(collection)
				record.Set("media_key", mediaKey)
				record.Set("tag_id", tagID)
				if err := txApp.Save(record); err != nil {
					return fmt.Errorf("save album tag assignment: %w", err)
				}
				changed++
				continue
			}
			if errors.Is(findErr, sql.ErrNoRows) {
				continue
			}
			if findErr != nil {
				return fmt.Errorf("find album tag assignment: %w", findErr)
			}
			if err := txApp.Delete(existing); err != nil {
				return fmt.Errorf("delete album tag assignment: %w", err)
			}
			changed++
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return e.NotFoundError("태그 또는 앨범 미디어를 찾지 못했습니다.", nil)
		}
		return e.BadRequestError(err.Error(), err)
	}

	return e.JSON(http.StatusOK, map[string]any{
		"tag_id":     tagID,
		"action":     action,
		"selected":   len(mediaKeys),
		"changed":    changed,
		"media_keys": mediaKeys,
	})
}

func normalizeAlbumTagName(value string) string {
	return strings.Join(strings.Fields(norm.NFKC.String(value)), " ")
}

func validateAlbumTagName(name string) error {
	count := utf8.RuneCountInString(name)
	if count < 1 || count > albumTagMaxRunes {
		return fmt.Errorf("태그는 1~%d자로 입력해주세요", albumTagMaxRunes)
	}
	return nil
}

func normalizeAlbumMediaKeys(values []string) ([]string, error) {
	if len(values) == 0 {
		return nil, fmt.Errorf("선택한 미디어가 없습니다")
	}
	if len(values) > albumTagBatchMax {
		return nil, fmt.Errorf("한 번에 최대 %d개까지 분류할 수 있습니다", albumTagBatchMax)
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		key := strings.TrimSpace(value)
		if !albumMediaKeyPattern.MatchString(key) {
			return nil, fmt.Errorf("유효하지 않은 미디어 키가 포함되어 있습니다")
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result, nil
}

func ensureAlbumMediaRecordExists(app core.App, mediaKey string) error {
	parts := strings.SplitN(mediaKey, ":", 2)
	_, err := app.FindRecordById(parts[0], parts[1])
	if err != nil {
		return fmt.Errorf("album media source %s: %w", mediaKey, err)
	}
	return nil
}

func albumTagResponse(record *core.Record, count int64) map[string]any {
	return map[string]any{
		"id":               record.Id,
		"name":             record.GetString("name"),
		"position":         record.GetInt("position"),
		"assignment_count": count,
	}
}
