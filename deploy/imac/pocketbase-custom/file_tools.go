package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

const (
	fileToolsBasePath       = "/api/cwk/tools"
	fileToolsJobsPath       = fileToolsBasePath + "/jobs"
	fileToolsJobPath        = fileToolsJobsPath + "/{id}"
	fileToolsJobResultPath  = fileToolsJobPath + "/result"
	fileToolsCapabilities   = fileToolsBasePath + "/capabilities"
	fileToolMaxUploadBytes  = int64(200 * 1024 * 1024)
	fileToolBodyMaxBytes    = fileToolMaxUploadBytes + (2 * 1024 * 1024)
	fileToolMaxOutputBytes  = int64(400 * 1024 * 1024)
	fileToolMaxFiles        = 20
	fileToolQueueCapacity   = 3
	fileToolResultTTL       = 30 * time.Minute
	fileToolCleanupInterval = 10 * time.Minute
	fileToolMaxOptionBytes  = int64(16 * 1024)
	fileToolMaxFieldBytes   = int64(1024)
	fileToolCommandLogBytes = 32 * 1024
	fileToolArchiveMaxBytes = uint64(1024 * 1024 * 1024)
	fileToolArchiveMaxFiles = 10_000
	fileToolImageMaxPixels  = uint64(100_000_000)
	fileToolOCRPageMaxBytes = int64(128 * 1024 * 1024)
	fileToolOCRWorkMaxBytes = int64(512 * 1024 * 1024)
	fileToolH2OVersion      = "0.7.13"
	fileToolH2OJarSHA256    = "7fc83e85cc6b0ab8be1dcdd8d6da30f137199212ec88a493c033b58e6fcfde67"
	fileToolRootSentinel    = ".cwk-file-tools-root-v1"
	fileToolSentinelContent = "coldwaterkim file tools root v1\n"
)

type fileToolStatus string

const (
	fileToolQueued   fileToolStatus = "queued"
	fileToolRunning  fileToolStatus = "running"
	fileToolDone     fileToolStatus = "done"
	fileToolError    fileToolStatus = "error"
	fileToolCanceled fileToolStatus = "cancelled"
)

type fileToolDefinition struct {
	Name       string
	Extensions map[string]bool
	Required   []string
	MaxFiles   int
	Timeout    time.Duration
}

var fileToolDefinitions = map[string]fileToolDefinition{
	"office-to-pdf": {
		Name: "office-to-pdf", Extensions: extensionSet(".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"),
		Required: fileToolRequirements("soffice"), MaxFiles: fileToolMaxFiles, Timeout: 2 * time.Minute,
	},
	"hwp-to-pdf": {
		Name: "hwp-to-pdf", Extensions: extensionSet(".hwp", ".hwpx"), Required: fileToolRequirements("soffice", "java", "h2orestart"),
		MaxFiles: 1, Timeout: 2 * time.Minute,
	},
	"pdf-ocr": {
		Name: "pdf-ocr", Extensions: extensionSet(".pdf", ".jpg", ".jpeg", ".png", ".heic"), Required: fileToolRequirements("tesseract", "pdfinfo", "pdftoppm", "qpdf", "sips"),
		MaxFiles: fileToolMaxFiles, Timeout: 15 * time.Minute,
	},
	"pdf-compress": {
		Name: "pdf-compress", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("gs"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
	"pdf-protect": {
		Name: "pdf-protect", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("qpdf"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
	"pdf-unlock": {
		Name: "pdf-unlock", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("qpdf"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
	"pdf-repair": {
		Name: "pdf-repair", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("qpdf"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
	"pdf-grayscale": {
		Name: "pdf-grayscale", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("gs"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
	"pdf-to-text": {
		Name: "pdf-to-text", Extensions: extensionSet(".pdf"), Required: fileToolRequirements("pdftotext"), MaxFiles: 1, Timeout: 5 * time.Minute,
	},
}

type fileToolOptions struct {
	Password  string `json:"password"`
	Grayscale bool   `json:"grayscale"`
	Language  string `json:"language"`
	Quality   string `json:"quality"`
}

type fileToolInput struct {
	Path      string
	Extension string
	Size      int64
}

type fileToolJob struct {
	mu sync.RWMutex

	ID          string
	Operation   string
	Status      fileToolStatus
	Options     fileToolOptions
	Inputs      []fileToolInput
	Dir         string
	ResultPath  string
	ResultName  string
	ResultMIME  string
	Error       string
	CreatedAt   time.Time
	StartedAt   time.Time
	FinishedAt  time.Time
	cancel      context.CancelFunc
	expiryTimer *time.Timer
	deleteAfter bool
	expired     bool
}

type fileToolJobResponse struct {
	ID          string         `json:"id"`
	Operation   string         `json:"operation"`
	Status      fileToolStatus `json:"status"`
	Error       string         `json:"error,omitempty"`
	ResultName  string         `json:"result_name,omitempty"`
	ResultURL   string         `json:"result_url,omitempty"`
	CreatedAt   string         `json:"created_at"`
	StartedAt   string         `json:"started_at,omitempty"`
	FinishedAt  string         `json:"finished_at,omitempty"`
	ExpiresAt   string         `json:"expires_at,omitempty"`
	InputCount  int            `json:"input_count"`
	UploadBytes int64          `json:"upload_bytes"`
}

type fileToolCapability struct {
	Name      string   `json:"name"`
	Available bool     `json:"available"`
	Requires  []string `json:"requires"`
	MaxFiles  int      `json:"max_files"`
	Timeout   int64    `json:"timeout_seconds"`
}

type fileToolBinaryCapability struct {
	Available bool   `json:"available"`
	Version   string `json:"version,omitempty"`
}

type fileToolService struct {
	app                 core.App
	rootDir             string
	ownerUserID         string
	toolPaths           map[string]string
	dependencyAvailable func(string, string) bool

	mu        sync.RWMutex
	jobs      map[string]*fileToolJob
	queue     chan *fileToolJob
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	now       func() time.Time
	process   func(context.Context, *fileToolJob) error
	closeOnce sync.Once
	resultTTL time.Duration
}

func extensionSet(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func fileToolRequirements(values ...string) []string {
	return append([]string{"sandbox-exec"}, values...)
}

func newFileToolService(app core.App, rootDir, ownerUserID string) (*fileToolService, error) {
	rootDir, err := prepareFileToolRoot(rootDir)
	if err != nil {
		return nil, err
	}
	ownerUserID = resolveFileToolOwnerUserID(rootDir, ownerUserID)
	ctx, cancel := context.WithCancel(context.Background())
	service := &fileToolService{
		app:                 app,
		rootDir:             rootDir,
		ownerUserID:         ownerUserID,
		toolPaths:           discoverFileToolPaths(),
		dependencyAvailable: fileToolDependencyAvailable,
		jobs:                map[string]*fileToolJob{},
		queue:               make(chan *fileToolJob, fileToolQueueCapacity),
		ctx:                 ctx,
		cancel:              cancel,
		now:                 time.Now,
		resultTTL:           fileToolResultTTL,
	}
	service.process = service.processJob
	if err := service.removeOrphanJobDirectories(); err != nil {
		cancel()
		return nil, err
	}
	service.wg.Add(2)
	go service.worker()
	go service.cleanupLoop()
	return service, nil
}

func (service *fileToolService) close() {
	service.closeOnce.Do(func() {
		service.cancel()
		service.mu.RLock()
		for _, job := range service.jobs {
			job.mu.Lock()
			cancel := job.cancel
			if job.expiryTimer != nil {
				job.expiryTimer.Stop()
			}
			job.mu.Unlock()
			if cancel != nil {
				cancel()
			}
		}
		service.mu.RUnlock()
		service.wg.Wait()
	})
}

func (service *fileToolService) registerRoutes(e *core.ServeEvent) {
	owner := requireOwner(service.ownerUserID)
	e.Router.GET(fileToolsCapabilities, service.capabilities).Bind(owner)
	e.Router.POST(fileToolsJobsPath, service.createJob).
		Unbind(apis.DefaultBodyLimitMiddlewareId).
		Bind(apis.BodyLimit(fileToolBodyMaxBytes)).
		Bind(owner)
	e.Router.GET(fileToolsJobPath, service.getJob).Bind(owner)
	e.Router.GET(fileToolsJobResultPath, service.downloadResult).Bind(owner)
	e.Router.DELETE(fileToolsJobPath, service.deleteJob).Bind(owner)
}

func (service *fileToolService) capabilities(e *core.RequestEvent) error {
	names := make([]string, 0, len(fileToolDefinitions))
	for name := range fileToolDefinitions {
		names = append(names, name)
	}
	sort.Strings(names)
	operations := make([]fileToolCapability, 0, len(names))
	for _, name := range names {
		definition := fileToolDefinitions[name]
		operations = append(operations, fileToolCapability{
			Name: name, Available: service.operationAvailable(definition), Requires: append([]string(nil), definition.Required...),
			MaxFiles: definition.MaxFiles, Timeout: int64(definition.Timeout / time.Second),
		})
	}
	binaries := make(map[string]fileToolBinaryCapability, len(service.toolPaths))
	for name, path := range service.toolPaths {
		available := service.dependencyAvailable(name, path)
		capability := fileToolBinaryCapability{Available: available}
		if available {
			if name == "h2orestart" {
				capability.Version = fileToolH2OVersion
			} else {
				capability.Version = fileToolVersion(path, name)
			}
		}
		binaries[name] = capability
	}
	return e.JSON(http.StatusOK, map[string]any{
		"operations": operations,
		"binaries":   binaries,
		"limits": map[string]any{
			"max_upload_bytes":   fileToolMaxUploadBytes,
			"max_files":          fileToolMaxFiles,
			"concurrency":        1,
			"queue_capacity":     fileToolQueueCapacity,
			"result_ttl_seconds": int64(service.resultTTL / time.Second),
		},
	})
}

func (service *fileToolService) createJob(e *core.RequestEvent) error {
	job, err := service.readMultipartJob(e.Request)
	if err != nil {
		return e.BadRequestError(err.Error(), nil)
	}
	definition, ok := fileToolDefinitions[job.Operation]
	if !ok {
		os.RemoveAll(job.Dir)
		return e.BadRequestError("지원하지 않는 파일 작업입니다.", nil)
	}
	if !service.operationAvailable(definition) {
		os.RemoveAll(job.Dir)
		return e.BadRequestError("이 작업에 필요한 변환기가 서버에 설치되지 않았습니다.", nil)
	}
	if err := validateFileToolJob(job, definition); err != nil {
		os.RemoveAll(job.Dir)
		return e.BadRequestError(err.Error(), nil)
	}
	availableBytes, diskErr := availableDiskBytes(service.rootDir)
	requiredBytes := minimumFreeDiskBytes + (jobUploadBytes(job) * 6)
	if job.Operation == "pdf-ocr" {
		requiredBytes += fileToolOCRWorkMaxBytes * 2
	}
	if diskErr != nil || availableBytes < requiredBytes {
		os.RemoveAll(job.Dir)
		return e.BadRequestError("파일 작업을 안전하게 처리할 디스크 여유 공간이 부족합니다.", diskErr)
	}

	service.mu.Lock()
	service.jobs[job.ID] = job
	service.mu.Unlock()
	select {
	case service.queue <- job:
		return e.JSON(http.StatusAccepted, service.jobResponse(job))
	default:
		service.mu.Lock()
		delete(service.jobs, job.ID)
		service.mu.Unlock()
		os.RemoveAll(job.Dir)
		return e.JSON(http.StatusServiceUnavailable, map[string]any{
			"message": "파일 작업 대기열이 가득 찼습니다. 잠시 뒤 다시 시도해 주세요.",
		})
	}
}

func (service *fileToolService) getJob(e *core.RequestEvent) error {
	job := service.findJob(e.Request.PathValue("id"))
	if job == nil {
		return e.NotFoundError("파일 작업을 찾지 못했습니다.", nil)
	}
	return e.JSON(http.StatusOK, service.jobResponse(job))
}

func (service *fileToolService) downloadResult(e *core.RequestEvent) error {
	job := service.findJob(e.Request.PathValue("id"))
	if job == nil {
		return e.NotFoundError("파일 작업을 찾지 못했습니다.", nil)
	}
	job.mu.RLock()
	status, resultPath, resultName, resultMIME := job.Status, job.ResultPath, job.ResultName, job.ResultMIME
	job.mu.RUnlock()
	if status != fileToolDone || resultPath == "" {
		return e.BadRequestError("아직 내려받을 결과가 없습니다.", nil)
	}
	if !pathInsideDirectory(service.rootDir, resultPath) {
		return e.InternalServerError("결과 파일 경로가 안전하지 않습니다.", nil)
	}
	file, err := os.Open(resultPath)
	if err != nil {
		return e.NotFoundError("결과 파일을 찾지 못했습니다.", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return e.NotFoundError("결과 파일을 찾지 못했습니다.", err)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	e.Response.Header().Set("X-Content-Type-Options", "nosniff")
	e.Response.Header().Set("Content-Disposition", contentDispositionAttachment(resultName))
	if resultMIME == "" {
		resultMIME = "application/octet-stream"
	}
	e.Response.Header().Set("Content-Type", resultMIME)
	http.ServeContent(e.Response, e.Request, resultName, info.ModTime(), file)
	return nil
}

func (service *fileToolService) deleteJob(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	service.mu.RLock()
	job := service.jobs[id]
	service.mu.RUnlock()
	if job == nil {
		return e.NotFoundError("파일 작업을 찾지 못했습니다.", nil)
	}
	job.mu.Lock()
	job.deleteAfter = true
	job.Status = fileToolCanceled
	job.Options.Password = ""
	job.FinishedAt = service.now()
	cancel := job.cancel
	job.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if !service.expireJob(id, job) {
		return e.InternalServerError("파일 작업을 지우지 못했습니다.", errors.New("job directory removal failed"))
	}
	return e.JSON(http.StatusOK, map[string]any{"id": id, "deleted": true})
}

func (service *fileToolService) findJob(id string) *fileToolJob {
	if !isFileToolJobID(id) {
		return nil
	}
	service.mu.RLock()
	job := service.jobs[id]
	service.mu.RUnlock()
	if job == nil {
		return nil
	}
	job.mu.RLock()
	expired := job.expired || (!job.FinishedAt.IsZero() && !service.now().Before(job.FinishedAt.Add(service.resultTTL)))
	job.mu.RUnlock()
	if expired {
		service.expireJob(id, job)
		return nil
	}
	return job
}

func (service *fileToolService) worker() {
	defer service.wg.Done()
	for {
		select {
		case <-service.ctx.Done():
			return
		case job := <-service.queue:
			service.runJob(job)
		}
	}
}

func (service *fileToolService) runJob(job *fileToolJob) {
	job.mu.Lock()
	if job.deleteAfter || job.Status == fileToolCanceled {
		job.mu.Unlock()
		return
	}
	definition := fileToolDefinitions[job.Operation]
	ctx, cancel := context.WithTimeout(service.ctx, definition.Timeout)
	job.cancel = cancel
	job.Status = fileToolRunning
	job.StartedAt = service.now()
	job.mu.Unlock()

	err := service.process(ctx, job)
	cancel()
	now := service.now()
	job.mu.Lock()
	job.Options.Password = ""
	job.cancel = nil
	if job.deleteAfter || job.Status == fileToolCanceled {
		job.mu.Unlock()
		os.RemoveAll(job.Dir)
		return
	}
	job.FinishedAt = now
	if err != nil {
		job.Status = fileToolError
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			job.Error = "파일 작업 시간이 초과되었습니다."
		} else if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			job.Status = fileToolCanceled
			job.Error = "파일 작업이 취소되었습니다."
		} else {
			job.Error = "파일 변환에 실패했습니다. 입력 파일을 확인해 주세요."
		}
		job.mu.Unlock()
		if removeErr := os.RemoveAll(job.Dir); removeErr != nil && service.app != nil {
			service.app.Logger().Warn("Failed to remove errored file tool job", "jobId", job.ID, "error", removeErr.Error())
		}
		service.logJobFailure(job, err)
		service.scheduleExpiration(job)
		return
	}
	job.Status = fileToolDone
	job.mu.Unlock()
	service.scheduleExpiration(job)
}

func (service *fileToolService) scheduleExpiration(job *fileToolJob) {
	job.mu.Lock()
	if job.expiryTimer != nil {
		job.expiryTimer.Stop()
	}
	job.expiryTimer = time.AfterFunc(service.resultTTL, func() {
		service.expireJob(job.ID, job)
	})
	job.mu.Unlock()
}

func (service *fileToolService) expireJob(id string, job *fileToolJob) bool {
	job.mu.Lock()
	job.expired = true
	job.Options.Password = ""
	if job.expiryTimer != nil {
		job.expiryTimer.Stop()
		job.expiryTimer = nil
	}
	job.mu.Unlock()
	if err := os.RemoveAll(job.Dir); err != nil && !os.IsNotExist(err) {
		if service.app != nil {
			service.app.Logger().Warn("Failed to expire file tool job", "jobId", id, "error", err.Error())
		}
		return false
	}
	service.mu.Lock()
	if service.jobs[id] == job {
		delete(service.jobs, id)
	}
	service.mu.Unlock()
	return true
}

func (service *fileToolService) cleanupLoop() {
	defer service.wg.Done()
	ticker := time.NewTicker(fileToolCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-service.ctx.Done():
			return
		case now := <-ticker.C:
			service.cleanupExpiredJobs(now)
		}
	}
}

func (service *fileToolService) cleanupExpiredJobs(now time.Time) int {
	var expired []*fileToolJob
	service.mu.RLock()
	for _, job := range service.jobs {
		job.mu.RLock()
		finishedAt := job.FinishedAt
		status := job.Status
		job.mu.RUnlock()
		if finishedAt.IsZero() || (status != fileToolDone && status != fileToolError && status != fileToolCanceled) {
			continue
		}
		if !now.Before(finishedAt.Add(service.resultTTL)) {
			expired = append(expired, job)
		}
	}
	service.mu.RUnlock()
	removed := 0
	for _, job := range expired {
		if service.expireJob(job.ID, job) {
			removed++
		}
	}
	return removed
}

func (service *fileToolService) jobResponse(job *fileToolJob) fileToolJobResponse {
	job.mu.RLock()
	defer job.mu.RUnlock()
	response := fileToolJobResponse{
		ID: job.ID, Operation: job.Operation, Status: job.Status, Error: job.Error, ResultName: job.ResultName,
		CreatedAt: job.CreatedAt.UTC().Format(time.RFC3339), InputCount: len(job.Inputs), UploadBytes: jobUploadBytes(job),
	}
	if !job.StartedAt.IsZero() {
		response.StartedAt = job.StartedAt.UTC().Format(time.RFC3339)
	}
	if !job.FinishedAt.IsZero() {
		response.FinishedAt = job.FinishedAt.UTC().Format(time.RFC3339)
		response.ExpiresAt = job.FinishedAt.Add(service.resultTTL).UTC().Format(time.RFC3339)
	}
	if job.Status == fileToolDone {
		response.ResultURL = fileToolsJobsPath + "/" + job.ID + "/result"
	}
	return response
}

func (service *fileToolService) readMultipartJob(request *http.Request) (*fileToolJob, error) {
	reader, err := request.MultipartReader()
	if err != nil {
		return nil, errors.New("multipart/form-data 파일 업로드가 필요합니다")
	}
	id, err := newFileToolJobID()
	if err != nil {
		return nil, errors.New("파일 작업 번호를 만들지 못했습니다")
	}
	dir := filepath.Join(service.rootDir, id)
	if err := os.Mkdir(dir, 0700); err != nil {
		return nil, errors.New("파일 작업 공간을 만들지 못했습니다")
	}
	job := &fileToolJob{ID: id, Status: fileToolQueued, Dir: dir, CreatedAt: service.now()}
	succeeded := false
	defer func() {
		if !succeeded {
			os.RemoveAll(dir)
		}
	}()
	var optionsRaw []byte
	var total int64
	for {
		part, nextErr := reader.NextPart()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			return nil, errors.New("업로드를 끝까지 읽지 못했습니다")
		}
		name := part.FormName()
		filename := part.FileName()
		if filename == "" {
			limit := fileToolMaxFieldBytes
			if name == "options" {
				limit = fileToolMaxOptionBytes
			}
			value, readErr := readLimitedPart(part, limit)
			part.Close()
			if readErr != nil {
				return nil, readErr
			}
			switch name {
			case "operation":
				job.Operation = strings.TrimSpace(string(value))
			case "options":
				optionsRaw = value
			}
			continue
		}
		if name != "files" && name != "file" {
			part.Close()
			return nil, errors.New("알 수 없는 파일 필드가 들어왔습니다")
		}
		if len(job.Inputs) >= fileToolMaxFiles {
			part.Close()
			return nil, fmt.Errorf("파일은 한 번에 최대 %d개까지 처리할 수 있습니다", fileToolMaxFiles)
		}
		extension := safeUploadExtension(filename)
		inputPath := filepath.Join(dir, fmt.Sprintf("input-%03d%s", len(job.Inputs)+1, extension))
		size, copyErr := copyUploadedFile(inputPath, part, fileToolMaxUploadBytes-total)
		part.Close()
		if copyErr != nil {
			return nil, copyErr
		}
		total += size
		job.Inputs = append(job.Inputs, fileToolInput{Path: inputPath, Extension: extension, Size: size})
	}
	if len(optionsRaw) > 0 {
		decoder := json.NewDecoder(bytes.NewReader(optionsRaw))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&job.Options); err != nil {
			return nil, errors.New("작업 설정 JSON이 올바르지 않습니다")
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			return nil, errors.New("작업 설정 JSON 뒤에 불필요한 값이 있습니다")
		}
	}
	succeeded = true
	return job, nil
}

func validateFileToolJob(job *fileToolJob, definition fileToolDefinition) error {
	if len(job.Inputs) == 0 {
		return errors.New("처리할 파일을 하나 이상 선택해 주세요")
	}
	if len(job.Inputs) > definition.MaxFiles {
		return fmt.Errorf("이 작업은 파일을 최대 %d개까지 받을 수 있습니다", definition.MaxFiles)
	}
	for _, input := range job.Inputs {
		if !definition.Extensions[input.Extension] {
			return fmt.Errorf("%s 파일은 이 작업에서 지원하지 않습니다", input.Extension)
		}
		if err := validateFileSignature(input); err != nil {
			return err
		}
	}
	if strings.ContainsAny(job.Options.Password, "\x00\r\n") || len([]rune(job.Options.Password)) > 128 {
		return errors.New("PDF 비밀번호는 줄바꿈 없이 128자 이하로 입력해 주세요")
	}
	if (job.Operation == "pdf-protect" || job.Operation == "pdf-unlock") && job.Options.Password == "" {
		return errors.New("PDF 비밀번호를 입력해 주세요")
	}
	if job.Operation == "pdf-ocr" {
		language := strings.TrimSpace(job.Options.Language)
		if language == "" {
			job.Options.Language = "kor+eng"
		} else if language != "kor+eng" && language != "kor" && language != "eng" {
			return errors.New("OCR 언어는 kor+eng, kor 또는 eng만 지원합니다")
		}
	}
	if job.Operation == "pdf-compress" {
		quality := strings.TrimSpace(job.Options.Quality)
		if quality == "" {
			job.Options.Quality = "balanced"
		} else if quality != "balanced" && quality != "strong" && quality != "light" {
			return errors.New("PDF 압축 강도는 balanced, strong 또는 light만 지원합니다")
		}
	}
	return nil
}

func validateFileSignature(input fileToolInput) error {
	file, err := os.Open(input.Path)
	if err != nil {
		return errors.New("업로드한 파일을 확인하지 못했습니다")
	}
	defer file.Close()
	header := make([]byte, 16)
	n, _ := io.ReadFull(file, header)
	header = header[:n]
	if input.Extension == ".pdf" {
		if !bytes.HasPrefix(header, []byte("%PDF-")) {
			return errors.New("확장자는 PDF지만 실제 PDF 파일이 아닙니다")
		}
		return nil
	}
	zipOffice := input.Extension == ".docx" || input.Extension == ".xlsx" || input.Extension == ".pptx" ||
		input.Extension == ".odt" || input.Extension == ".ods" || input.Extension == ".odp" || input.Extension == ".hwpx"
	if zipOffice && !bytes.HasPrefix(header, []byte{'P', 'K', 3, 4}) {
		return errors.New("확장자는 Office 문서지만 실제 문서 파일이 아닙니다")
	}
	if zipOffice {
		if err := validateOfficeArchive(input.Path, input.Extension); err != nil {
			return err
		}
	}
	legacyOffice := input.Extension == ".doc" || input.Extension == ".xls" || input.Extension == ".ppt" || input.Extension == ".hwp"
	compoundHeader := []byte{0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1}
	if legacyOffice && (len(header) < len(compoundHeader) || !bytes.Equal(header[:len(compoundHeader)], compoundHeader)) {
		return errors.New("확장자는 Office 문서지만 실제 문서 파일이 아닙니다")
	}
	if input.Extension == ".jpg" || input.Extension == ".jpeg" {
		if len(header) < 3 || !bytes.Equal(header[:3], []byte{0xff, 0xd8, 0xff}) {
			return errors.New("확장자는 JPEG지만 실제 JPEG 파일이 아닙니다")
		}
	}
	if input.Extension == ".png" {
		pngHeader := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
		if len(header) < len(pngHeader) || !bytes.Equal(header[:len(pngHeader)], pngHeader) {
			return errors.New("확장자는 PNG지만 실제 PNG 파일이 아닙니다")
		}
	}
	if input.Extension == ".jpg" || input.Extension == ".jpeg" || input.Extension == ".png" {
		if err := validateRasterImageDimensions(input.Path); err != nil {
			return err
		}
	}
	if input.Extension == ".heic" {
		if len(header) < 12 || !bytes.Equal(header[4:8], []byte("ftyp")) || !isHEICBrand(string(header[8:12])) {
			return errors.New("확장자는 HEIC지만 실제 HEIC 파일이 아닙니다")
		}
	}
	return nil
}

func validateOfficeArchive(path, extension string) error {
	archive, err := zip.OpenReader(path)
	if err != nil {
		return errors.New("압축 문서 구조를 읽지 못했습니다")
	}
	defer archive.Close()
	info, err := os.Stat(path)
	if err != nil {
		return errors.New("압축 문서 크기를 읽지 못했습니다")
	}
	var total uint64
	entries := make(map[string]bool, len(archive.File))
	for _, entry := range archive.File {
		if ^uint64(0)-total < entry.UncompressedSize64 {
			return errors.New("압축 문서 크기가 올바르지 않습니다")
		}
		total += entry.UncompressedSize64
		entries[filepath.ToSlash(entry.Name)] = true
	}
	if !officeArchiveWithinLimits(uint64(info.Size()), total, len(archive.File)) {
		return errors.New("압축을 풀었을 때 지나치게 커지는 문서는 처리할 수 없습니다")
	}
	required := ""
	switch extension {
	case ".docx":
		required = "word/document.xml"
	case ".xlsx":
		required = "xl/workbook.xml"
	case ".pptx":
		required = "ppt/presentation.xml"
	case ".odt", ".ods", ".odp":
		required = "mimetype"
	case ".hwpx":
		required = "Contents/content.hpf"
	}
	if required == "" || !entries[required] {
		return errors.New("확장자와 실제 압축 문서 형식이 일치하지 않습니다")
	}
	return nil
}

func officeArchiveWithinLimits(compressedBytes, expandedBytes uint64, entries int) bool {
	if compressedBytes == 0 || entries < 1 || entries > fileToolArchiveMaxFiles || expandedBytes > fileToolArchiveMaxBytes {
		return false
	}
	if expandedBytes > 100*1024*1024 && expandedBytes/compressedBytes > 100 {
		return false
	}
	return true
}

func validateRasterImageDimensions(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return errors.New("이미지 크기를 읽지 못했습니다")
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil || config.Width < 1 || config.Height < 1 {
		return errors.New("실제 이미지 파일을 읽지 못했습니다")
	}
	pixels := uint64(config.Width) * uint64(config.Height)
	if config.Width > 20_000 || config.Height > 20_000 || pixels > fileToolImageMaxPixels {
		return errors.New("이미지 해상도가 안전 처리 한도를 넘었습니다")
	}
	return nil
}

func isHEICBrand(brand string) bool {
	switch brand {
	case "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1":
		return true
	default:
		return false
	}
}

func readLimitedPart(reader io.Reader, maximum int64) ([]byte, error) {
	value, err := io.ReadAll(io.LimitReader(reader, maximum+1))
	if err != nil {
		return nil, errors.New("업로드 필드를 읽지 못했습니다")
	}
	if int64(len(value)) > maximum {
		return nil, errors.New("업로드 설정이 너무 큽니다")
	}
	return value, nil
}

func copyUploadedFile(path string, source io.Reader, remaining int64) (int64, error) {
	if remaining <= 0 {
		return 0, errors.New("전체 업로드 크기는 200MiB를 넘을 수 없습니다")
	}
	target, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, errors.New("업로드 파일을 저장하지 못했습니다")
	}
	written, copyErr := io.Copy(target, io.LimitReader(source, remaining+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		return 0, errors.New("업로드 파일을 끝까지 저장하지 못했습니다")
	}
	if written > remaining {
		return 0, errors.New("전체 업로드 크기는 200MiB를 넘을 수 없습니다")
	}
	return written, nil
}

func safeUploadExtension(filename string) string {
	filename = strings.ReplaceAll(filename, "\\", "/")
	return strings.ToLower(filepath.Ext(filepath.Base(filename)))
}

func jobUploadBytes(job *fileToolJob) int64 {
	var total int64
	for _, input := range job.Inputs {
		total += input.Size
	}
	return total
}

func newFileToolJobID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

func isFileToolJobID(value string) bool {
	if len(value) != 32 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && strings.ToLower(value) == value
}

func prepareFileToolRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errors.New("file tool job directory is empty")
	}
	absolute, err := filepath.Abs(filepath.Clean(root))
	if err != nil || filepath.Dir(absolute) == absolute {
		return "", errors.New("file tool job directory is unsafe")
	}
	existed := true
	if info, statErr := os.Lstat(absolute); statErr == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return "", errors.New("file tool job directory must be a real directory")
		}
	} else if os.IsNotExist(statErr) {
		existed = false
	} else {
		return "", statErr
	}
	if err := os.MkdirAll(absolute, 0700); err != nil {
		return "", err
	}
	if err := os.Chmod(absolute, 0700); err != nil {
		return "", err
	}
	sentinel := filepath.Join(absolute, fileToolRootSentinel)
	if contents, readErr := os.ReadFile(sentinel); readErr == nil {
		info, statErr := os.Lstat(sentinel)
		if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || string(contents) != fileToolSentinelContent {
			return "", errors.New("file tool job directory sentinel is invalid")
		}
		if err := os.Chmod(sentinel, 0600); err != nil {
			return "", err
		}
		return absolute, nil
	} else if !os.IsNotExist(readErr) {
		return "", errors.New("file tool job directory sentinel is unreadable")
	}
	if existed {
		entries, readErr := os.ReadDir(absolute)
		if readErr != nil {
			return "", readErr
		}
		if len(entries) != 0 {
			return "", errors.New("refusing an existing nonempty file tool directory without its sentinel")
		}
	}
	if err := os.WriteFile(sentinel, []byte(fileToolSentinelContent), 0600); err != nil {
		return "", err
	}
	return absolute, nil
}

func (service *fileToolService) removeOrphanJobDirectories() error {
	entries, err := os.ReadDir(service.rootDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() || !isFileToolJobID(entry.Name()) {
			continue
		}
		path := filepath.Join(service.rootDir, entry.Name())
		if !pathInsideDirectory(service.rootDir, path) {
			return errors.New("unsafe orphan job path")
		}
		if err := os.RemoveAll(path); err != nil {
			return err
		}
	}
	return nil
}

func pathInsideDirectory(root, path string) bool {
	rootAbsolute, rootErr := filepath.Abs(root)
	pathAbsolute, pathErr := filepath.Abs(path)
	if rootErr != nil || pathErr != nil {
		return false
	}
	relative, err := filepath.Rel(rootAbsolute, pathAbsolute)
	return err == nil && relative != "." && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func contentDispositionAttachment(filename string) string {
	filename = filepath.Base(filename)
	if filename == "." || filename == "" {
		filename = "file-tool-result.bin"
	}
	return mime.FormatMediaType("attachment", map[string]string{"filename": filename})
}

func (service *fileToolService) operationAvailable(definition fileToolDefinition) bool {
	for _, required := range definition.Required {
		if !service.dependencyAvailable(required, service.toolPaths[required]) {
			return false
		}
	}
	return true
}

func discoverFileToolPaths() map[string]string {
	soffice := discoverSofficePath()
	return map[string]string{
		"sandbox-exec": "/usr/bin/sandbox-exec",
		"soffice":      soffice,
		"tesseract":    siblingToolPath("tesseract"),
		"pdfinfo":      siblingToolPath("pdfinfo"),
		"pdftoppm":     siblingToolPath("pdftoppm"),
		"qpdf":         siblingToolPath("qpdf"),
		"gs":           siblingToolPath("gs"),
		"pdftotext":    siblingToolPath("pdftotext"),
		"sips":         siblingToolPath("sips"),
		"java":         discoverJavaPath(),
		"h2orestart":   discoverH2ORestartPath(soffice),
	}
}

func discoverSofficePath() string {
	return discoverLibreOfficeToolPath("soffice")
}

func discoverLibreOfficeToolPath(name string) string {
	if sibling := siblingToolPath(name); isExecutableFile(sibling) {
		return sibling
	}
	for _, candidate := range []string{
		filepath.Join("/Applications/LibreOffice.app/Contents/MacOS", name),
		filepath.Join("/Applications/LibreOfficeDev.app/Contents/MacOS", name),
	} {
		if isExecutableFile(candidate) {
			return candidate
		}
	}
	return name
}

func discoverH2ORestartPath(soffice string) string {
	for _, candidate := range []string{
		"/Applications/LibreOffice.app/Contents/Resources/extensions/H2Orestart",
		"/Applications/LibreOfficeDev.app/Contents/Resources/extensions/H2Orestart",
	} {
		if info, err := os.Lstat(candidate); err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0 {
			return candidate
		}
	}
	resolved, err := filepath.EvalSymlinks(soffice)
	if err != nil {
		return "H2Orestart"
	}
	const marker = ".app/Contents/"
	index := strings.Index(resolved, marker)
	if index < 0 {
		return "H2Orestart"
	}
	contents := resolved[:index+len(".app")] + "/Contents"
	return filepath.Join(contents, "Resources", "extensions", "H2Orestart")
}

func discoverJavaPath() string {
	for _, candidate := range []string{siblingToolPath("java"), "/usr/bin/java"} {
		if isExecutableFile(candidate) {
			return candidate
		}
	}
	return "java"
}

func fileToolDependencyAvailable(name, path string) bool {
	if name == "h2orestart" {
		return validH2ORestartBundle(path)
	}
	if !isExecutableFile(path) {
		return false
	}
	if name == "java" {
		return supportedJavaVersion(fileToolVersion(path, name))
	}
	return true
}

func validH2ORestartBundle(path string) bool {
	return validH2ORestartBundleWithHash(path, fileToolH2OJarSHA256)
}

func validH2ORestartBundleWithHash(path, expectedJarSHA256 string) bool {
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return false
	}
	for _, relative := range []string{"META-INF/manifest.xml", "package.components", "registry/H2Orestart_filters.xcu", "registry/H2Orestart_types.xcu", "registry/TypeDetection.xcu"} {
		fileInfo, statErr := os.Lstat(filepath.Join(path, relative))
		if statErr != nil || !fileInfo.Mode().IsRegular() || fileInfo.Mode()&os.ModeSymlink != 0 || fileInfo.Size() <= 0 {
			return false
		}
	}
	jarPath := filepath.Join(path, "H2Orestart.jar")
	jarInfo, err := os.Lstat(jarPath)
	if err != nil || !jarInfo.Mode().IsRegular() || jarInfo.Mode()&os.ModeSymlink != 0 || jarInfo.Size() <= 0 || jarInfo.Size() > 2*1024*1024 {
		return false
	}
	jar, err := os.Open(jarPath)
	if err != nil {
		return false
	}
	hash := sha256.New()
	written, copyErr := io.Copy(hash, io.LimitReader(jar, 2*1024*1024+1))
	closeErr := jar.Close()
	return copyErr == nil && closeErr == nil && written == jarInfo.Size() && fmt.Sprintf("%x", hash.Sum(nil)) == expectedJarSHA256
}

func supportedJavaVersion(output string) bool {
	fields := strings.Fields(output)
	for _, field := range fields {
		value := strings.Trim(field, `"(),`)
		parts := strings.Split(value, ".")
		if len(parts) == 0 {
			continue
		}
		major, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		if major == 1 && len(parts) > 1 {
			major, err = strconv.Atoi(parts[1])
			if err != nil {
				continue
			}
		}
		return major >= 21
	}
	return false
}

func isExecutableFile(path string) bool {
	if path == "" {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular() && info.Mode()&0111 != 0
}

func fileToolVersion(path, name string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	args := []string{"--version"}
	if name == "java" {
		args = []string{"-version"}
	}
	output, err := execFileToolCommand(ctx, path, args, "", "")
	if err != nil {
		return ""
	}
	line := strings.TrimSpace(output)
	if index := strings.IndexByte(line, '\n'); index >= 0 {
		line = line[:index]
	}
	if len(line) > 160 {
		line = line[:160]
	}
	return line
}

func (service *fileToolService) logJobFailure(job *fileToolJob, err error) {
	if service.app == nil {
		return
	}
	detail := err.Error()
	if job.Operation == "pdf-protect" || job.Operation == "pdf-unlock" {
		detail = "qpdf sensitive operation failed"
	}
	service.app.Logger().Warn("File tool job failed", "jobId", job.ID, "operation", job.Operation, "error", detail)
}

func zipFiles(outputPath string, files []string) error {
	return zipFilesWithLimit(outputPath, files, fileToolMaxOutputBytes)
}

var errFileToolOutputLimit = errors.New("compressed output exceeds size limit")

type maxBytesWriter struct {
	w         io.Writer
	remaining int64
}

func (writer *maxBytesWriter) Write(data []byte) (int, error) {
	if writer.remaining <= 0 {
		return 0, errFileToolOutputLimit
	}
	if int64(len(data)) > writer.remaining {
		allowed := int(writer.remaining)
		written, err := writer.w.Write(data[:allowed])
		writer.remaining -= int64(written)
		if err != nil {
			return written, err
		}
		return written, errFileToolOutputLimit
	}
	written, err := writer.w.Write(data)
	writer.remaining -= int64(written)
	return written, err
}

func zipFilesWithLimit(outputPath string, files []string, limit int64) error {
	target, err := os.OpenFile(outputPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	archive := zip.NewWriter(&maxBytesWriter{w: target, remaining: limit})
	for _, path := range files {
		input, openErr := os.Open(path)
		if openErr != nil {
			archive.Close()
			target.Close()
			return openErr
		}
		entry, createErr := archive.Create(filepath.Base(path))
		if createErr == nil {
			_, createErr = io.Copy(entry, input)
		}
		input.Close()
		if createErr != nil {
			archive.Close()
			target.Close()
			return createErr
		}
	}
	if err := archive.Close(); err != nil {
		target.Close()
		return err
	}
	return target.Close()
}

func resultMIMEForName(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".pdf":
		return "application/pdf"
	case ".txt":
		return "text/plain; charset=utf-8"
	case ".zip":
		return "application/zip"
	default:
		if detected := mime.TypeByExtension(filepath.Ext(name)); detected != "" {
			return detected
		}
		return "application/octet-stream"
	}
}
