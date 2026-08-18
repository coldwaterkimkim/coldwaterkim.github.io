package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

const (
	bgmTrimMinimumSeconds = 0.25
	bgmTrimDurationLeeway = 0.15
	bgmTrimMaximumSeconds = 6 * 60 * 60
	bgmTrimTimeout        = 30 * time.Minute
	bgmTrimMaxBytesPerSec = int64(64_000)
)

type bgmTrimService struct {
	app         core.App
	ffmpegPath  string
	ffprobePath string
	mu          sync.Mutex
}

type bgmTrimRequest struct {
	MediaID     string  `json:"media_id" form:"media_id"`
	StartSecond float64 `json:"start_second" form:"start_second"`
	EndSecond   float64 `json:"end_second" form:"end_second"`
	RequestID   string  `json:"request_id" form:"request_id"`
}

func newBGMTrimService(app core.App) *bgmTrimService {
	return &bgmTrimService{
		app:         app,
		ffmpegPath:  siblingToolPath("ffmpeg"),
		ffprobePath: siblingToolPath("ffprobe"),
	}
}

func (service *bgmTrimService) registerRoutes(e *core.ServeEvent) {
	e.Router.POST("/api/cwk/bgm/trim", service.trim).
		Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))
}

func (service *bgmTrimService) trim(e *core.RequestEvent) error {
	request := bgmTrimRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("Invalid BGM trim request.", err)
	}
	if !isPocketBaseRecordID(request.MediaID) {
		return e.BadRequestError("Invalid media id.", nil)
	}
	requestKey := bgmTrimRequestKey(request)
	if requestKey == "" {
		return e.BadRequestError("Invalid trim request id.", nil)
	}
	if existing := service.findTrimmedMedia(requestKey); existing != nil {
		return e.JSON(http.StatusOK, map[string]any{
			"media":           existing,
			"source_media_id": request.MediaID,
		})
	}

	record, err := service.app.FindRecordById("media", request.MediaID)
	if err != nil {
		return e.NotFoundError("The MP3 was not found.", err)
	}
	filename := record.GetString("file")
	if !strings.EqualFold(filepath.Ext(filename), ".mp3") {
		return e.BadRequestError("Only uploaded MP3 files can be trimmed.", nil)
	}

	sourcePath, err := localMediaPath(service.app, record, filename)
	if err != nil {
		return e.InternalServerError("Failed to locate the source MP3.", err)
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	if existing := service.findTrimmedMedia(requestKey); existing != nil {
		return e.JSON(http.StatusOK, map[string]any{
			"media":           existing,
			"source_media_id": request.MediaID,
		})
	}

	ctx, cancel := context.WithTimeout(e.Request.Context(), bgmTrimTimeout)
	defer cancel()
	originalDuration, err := probeAudioDuration(ctx, service.ffprobePath, sourcePath)
	if err != nil {
		return e.InternalServerError("Failed to inspect the source MP3.", err)
	}
	if err := validateBGMTrimRange(request.StartSecond, request.EndSecond, originalDuration); err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	estimatedOutputBytes := int64(math.Ceil((request.EndSecond - request.StartSecond) * float64(bgmTrimMaxBytesPerSec)))
	requiredBytes := minimumFreeDiskBytes + (estimatedOutputBytes * 2)
	availableBytes, err := availableDiskBytes(filepath.Dir(service.app.DataDir()))
	if err != nil || availableBytes < requiredBytes {
		return e.BadRequestError("Not enough free disk space to safely trim this MP3.", err)
	}

	workDir, err := os.MkdirTemp(filepath.Dir(service.app.DataDir()), ".cwk-bgm-trim-")
	if err != nil {
		return e.InternalServerError("Failed to prepare BGM trimming.", err)
	}
	defer os.RemoveAll(workDir)

	outputName := trimmedMP3Filename(filename)
	outputPath := filepath.Join(workDir, outputName)
	if err := runBGMTrim(ctx, service.ffmpegPath, sourcePath, outputPath, request.StartSecond, request.EndSecond); err != nil {
		return e.InternalServerError("Failed to trim the MP3.", err)
	}
	trimmedDuration, err := probeAudioDuration(ctx, service.ffprobePath, outputPath)
	expectedDuration := request.EndSecond - request.StartSecond
	allowedDurationDelta := math.Max(0.3, expectedDuration*0.02)
	if err != nil || trimmedDuration < bgmTrimMinimumSeconds || math.Abs(trimmedDuration-expectedDuration) > allowedDurationDelta {
		return e.InternalServerError("The trimmed MP3 could not be verified.", err)
	}
	if err := decodeAudioToEnd(ctx, service.ffmpegPath, outputPath); err != nil {
		return e.InternalServerError("The trimmed MP3 failed its decode check.", err)
	}
	outputInfo, err := os.Stat(outputPath)
	if err != nil || outputInfo.Size() > estimatedOutputBytes {
		return e.InternalServerError("The trimmed MP3 exceeded its safe output size.", err)
	}
	if err := ctx.Err(); err != nil {
		return e.InternalServerError("The BGM trim request was cancelled.", err)
	}

	media, err := service.createTrimmedMedia(ctx, record, outputPath, requestKey)
	if err != nil {
		return e.InternalServerError("Failed to register the trimmed MP3.", err)
	}
	return e.JSON(http.StatusCreated, map[string]any{
		"media":            media,
		"duration_seconds": trimmedDuration,
		"source_media_id":  record.Id,
	})
}

func (service *bgmTrimService) createTrimmedMedia(ctx context.Context, source *core.Record, outputPath, requestKey string) (*core.Record, error) {
	collection, err := service.app.FindCollectionByNameOrId("media")
	if err != nil {
		return nil, err
	}
	file, err := filesystem.NewFileFromPath(outputPath)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("file", file)
	record.Set("alt_text", source.GetString("alt_text"))
	record.Set("caption", source.GetString("caption"))
	record.Set("resumable_upload_id", requestKey)
	if err := service.app.SaveWithContext(ctx, record); err != nil {
		return nil, err
	}
	return record, nil
}

func (service *bgmTrimService) findTrimmedMedia(requestKey string) *core.Record {
	record, err := service.app.FindFirstRecordByData("media", "resumable_upload_id", requestKey)
	if err != nil {
		return nil
	}
	return record
}

func localMediaPath(app core.App, record *core.Record, filename string) (string, error) {
	if filename == "" || filepath.Base(filename) != filename {
		return "", errors.New("invalid stored filename")
	}
	path := filepath.Join(app.DataDir(), core.LocalStorageDirName, record.Collection().Id, record.Id, filename)
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("stored media is not a regular file")
	}
	return path, nil
}

func validateBGMTrimRange(startSecond, endSecond, duration float64) error {
	if math.IsNaN(startSecond) || math.IsInf(startSecond, 0) || math.IsNaN(endSecond) || math.IsInf(endSecond, 0) {
		return errors.New("Trim times must be finite numbers.")
	}
	if startSecond < 0 || endSecond-startSecond < bgmTrimMinimumSeconds {
		return errors.New("Select at least 0.25 seconds to trim.")
	}
	if endSecond-startSecond > bgmTrimMaximumSeconds {
		return errors.New("A trimmed BGM cannot be longer than 6 hours.")
	}
	if duration <= 0 || endSecond > duration+bgmTrimDurationLeeway {
		return errors.New("The trim range exceeds the MP3 duration.")
	}
	return nil
}

func probeAudioDuration(ctx context.Context, ffprobePath, sourcePath string) (float64, error) {
	output, err := exec.CommandContext(ctx, ffprobePath,
		"-v", "error", "-show_entries", "stream=codec_name,codec_type:format=duration", "-of", "json", sourcePath,
	).Output()
	if err != nil {
		return 0, err
	}
	payload := struct {
		Streams []struct {
			CodecName string `json:"codec_name"`
			CodecType string `json:"codec_type"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}{}
	if err := json.Unmarshal(output, &payload); err != nil {
		return 0, err
	}
	audioStreams := 0
	for _, stream := range payload.Streams {
		if stream.CodecType == "video" {
			return 0, errors.New("unexpected video stream")
		}
		if stream.CodecType == "audio" {
			audioStreams++
			if stream.CodecName != "mp3" {
				return 0, errors.New("audio stream is not MP3")
			}
		}
	}
	if audioStreams != 1 {
		return 0, errors.New("expected exactly one MP3 audio stream")
	}
	duration, err := strconv.ParseFloat(payload.Format.Duration, 64)
	if err != nil || duration <= 0 {
		return 0, errors.New("ffprobe returned an invalid duration")
	}
	return duration, nil
}

func runBGMTrim(ctx context.Context, ffmpegPath, sourcePath, outputPath string, startSecond, endSecond float64) error {
	duration := endSecond - startSecond
	command := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-nostdin", "-y",
		"-i", sourcePath, "-ss", formatTrimSecond(startSecond),
		"-t", formatTrimSecond(duration), "-map", "0:a:0",
		"-vn", "-sn", "-dn", "-codec:a", "libmp3lame", "-q:a", "2",
		"-map_metadata", "0", outputPath,
	)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func decodeAudioToEnd(ctx context.Context, ffmpegPath, sourcePath string) error {
	command := exec.CommandContext(ctx, ffmpegPath,
		"-hide_banner", "-loglevel", "error", "-xerror", "-nostdin",
		"-i", sourcePath, "-map", "0:a:0", "-f", "null", "-",
	)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("decode failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func bgmTrimRequestKey(request bgmTrimRequest) string {
	value := strings.TrimSpace(request.RequestID)
	if len(value) < 16 || len(value) > 80 {
		return ""
	}
	for _, char := range value {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' {
			return ""
		}
	}
	payload := strings.Join([]string{
		value,
		request.MediaID,
		formatTrimSecond(request.StartSecond),
		formatTrimSecond(request.EndSecond),
	}, "\n")
	digest := sha256.Sum256([]byte(payload))
	return fmt.Sprintf("bgm-trim:%x", digest)
}

func formatTrimSecond(value float64) string {
	return strconv.FormatFloat(value, 'f', 3, 64)
}

func trimmedMP3Filename(filename string) string {
	base := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	base = strings.TrimSuffix(base, "_trimmed")
	if base == "" {
		base = "bgm"
	}
	return base + "_trimmed.mp3"
}

func isPocketBaseRecordID(value string) bool {
	if len(value) != 15 {
		return false
	}
	for _, char := range value {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') {
			return false
		}
	}
	return true
}

func siblingToolPath(name string) string {
	if executable, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(executable), name)
		if info, statErr := os.Stat(candidate); statErr == nil && info.Mode()&0111 != 0 {
			return candidate
		}
	}
	if candidate, err := exec.LookPath(name); err == nil {
		return candidate
	}
	return name
}
