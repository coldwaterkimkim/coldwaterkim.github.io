package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestOwnerMiddlewareFailsClosedAndAllowsExplicitOwner(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	owner, ownerToken := createFileToolAuthRecord(t, app, users, "aaaaaaaaaaaaaaa", "owner@example.com")
	_, otherToken := createFileToolAuthRecord(t, app, users, "bbbbbbbbbbbbbbb", "other@example.com")
	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		t.Fatal(err)
	}
	_, superuserToken := createFileToolAuthRecord(t, app, superusers, "ccccccccccccccc", "root@example.com")

	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	router.GET("/owner", func(e *core.RequestEvent) error { return e.String(http.StatusOK, "ok") }).Bind(requireOwner(owner.Id))
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	for _, testCase := range []struct {
		name   string
		token  string
		status int
	}{
		{name: "anonymous", status: http.StatusUnauthorized},
		{name: "wrong user", token: otherToken, status: http.StatusForbidden},
		{name: "owner", token: ownerToken, status: http.StatusOK},
		{name: "superuser", token: superuserToken, status: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/owner", nil)
			if testCase.token != "" {
				request.Header.Set("Authorization", testCase.token)
			}
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			if response.Code != testCase.status {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}

	if normalizedOwnerUserID("bad") != "" {
		t.Fatal("malformed configured owner id did not fail closed")
	}
}

func TestFileToolAPIUploadStatusDownloadDelete(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	owner, ownerToken := createFileToolAuthRecord(t, app, users, "ddddddddddddddd", "tools-owner@example.com")

	service, err := newFileToolService(app, t.TempDir(), owner.Id)
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	fakeTool := filepath.Join(t.TempDir(), "pdftotext")
	if err := os.WriteFile(fakeTool, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
		t.Fatal(err)
	}
	service.toolPaths["pdftotext"] = fakeTool
	service.process = func(_ context.Context, job *fileToolJob) error {
		resultPath := filepath.Join(job.Dir, "result.txt")
		if err := os.WriteFile(resultPath, []byte("추출 결과"), 0600); err != nil {
			return err
		}
		job.mu.Lock()
		job.ResultPath = resultPath
		job.ResultName = "extracted.txt"
		job.ResultMIME = "text/plain; charset=utf-8"
		job.mu.Unlock()
		return nil
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	service.registerRoutes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	unauthorizedBody, unauthorizedType := fileToolMultipartBody(t, "pdf-to-text", "document.pdf", []byte("%PDF-1.7\n"), `{}`)
	unauthorized := fileToolAPIRequest(mux, http.MethodPost, fileToolsJobsPath, unauthorizedBody, unauthorizedType, "")
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}

	body, contentType := fileToolMultipartBody(t, "pdf-to-text", "../../document.pdf", []byte("%PDF-1.7\nbody"), `{}`)
	created := fileToolAPIRequest(mux, http.MethodPost, fileToolsJobsPath, body, contentType, ownerToken)
	if created.Code != http.StatusAccepted {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body.String())
	}
	response := fileToolJobResponse{}
	if err := json.Unmarshal(created.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !isFileToolJobID(response.ID) || response.Operation != "pdf-to-text" {
		t.Fatalf("unexpected job response: %+v", response)
	}

	deadline := time.Now().Add(2 * time.Second)
	for response.Status != fileToolDone && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
		status := fileToolAPIRequest(mux, http.MethodGet, fileToolsJobsPath+"/"+response.ID, nil, "", ownerToken)
		if status.Code != http.StatusOK {
			t.Fatalf("status request=%d body=%s", status.Code, status.Body.String())
		}
		if err := json.Unmarshal(status.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
	}
	if response.Status != fileToolDone || response.ResultURL == "" {
		t.Fatalf("job did not finish: %+v", response)
	}

	download := fileToolAPIRequest(mux, http.MethodGet, response.ResultURL, nil, "", ownerToken)
	if download.Code != http.StatusOK || download.Body.String() != "추출 결과" {
		t.Fatalf("download status=%d body=%q", download.Code, download.Body.String())
	}
	if got := download.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control=%q", got)
	}
	if disposition := download.Header().Get("Content-Disposition"); !strings.Contains(disposition, "attachment") || strings.Contains(disposition, "..") {
		t.Fatalf("unsafe content disposition: %q", disposition)
	}

	deleted := fileToolAPIRequest(mux, http.MethodDelete, fileToolsJobsPath+"/"+response.ID, nil, "", ownerToken)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body.String())
	}
	missing := fileToolAPIRequest(mux, http.MethodGet, fileToolsJobsPath+"/"+response.ID, nil, "", ownerToken)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("deleted job status=%d body=%s", missing.Code, missing.Body.String())
	}
}

func TestFileToolValidationAndCommandConstruction(t *testing.T) {
	validPDF := filepath.Join(t.TempDir(), "input.pdf")
	if err := os.WriteFile(validPDF, []byte("%PDF-1.7\n"), 0600); err != nil {
		t.Fatal(err)
	}
	job := &fileToolJob{
		Operation: "pdf-ocr",
		Inputs:    []fileToolInput{{Path: validPDF, Extension: ".pdf", Size: 9}},
		Options:   fileToolOptions{},
	}
	if err := validateFileToolJob(job, fileToolDefinitions["pdf-ocr"]); err != nil {
		t.Fatal(err)
	}
	if job.Options.Language != "kor+eng" {
		t.Fatalf("default OCR language=%q", job.Options.Language)
	}
	job.Options.Language = "../../etc"
	if err := validateFileToolJob(job, fileToolDefinitions["pdf-ocr"]); err == nil {
		t.Fatal("unsafe OCR language accepted")
	}

	fakePDF := filepath.Join(t.TempDir(), "fake.pdf")
	if err := os.WriteFile(fakePDF, []byte("not pdf"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := validateFileSignature(fileToolInput{Path: fakePDF, Extension: ".pdf"}); err == nil {
		t.Fatal("fake PDF signature accepted")
	}

	args := officeToPDFArgs("/tmp/input.docx", "/tmp/output", "file:///tmp/profile")
	joined := strings.Join(args, "\n")
	for _, expected := range []string{"--headless", "--convert-to\npdf:writer_pdf_Export", "--outdir\n/tmp/output", "/tmp/input.docx"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("office command missing %q: %#v", expected, args)
		}
	}
	hwpArgs := strings.Join(officeToPDFArgs("/tmp/input.hwpx", "/tmp/output", "file:///tmp/profile"), "\n")
	if strings.Contains(hwpArgs, "--infilter") || !strings.Contains(hwpArgs, "--convert-to\npdf:writer_pdf_Export") {
		t.Fatalf("HWP conversion must use bundled extension auto-detection: %s", hwpArgs)
	}
	for input, expected := range map[string]string{
		"input.xlsx": "pdf:calc_pdf_Export",
		"input.ods":  "pdf:calc_pdf_Export",
		"input.pptx": "pdf:impress_pdf_Export",
		"input.odp":  "pdf:impress_pdf_Export",
	} {
		if got := officePDFExportFilter(input); got != expected {
			t.Fatalf("%s export filter=%q, want %q", input, got, expected)
		}
	}
	grayArgs := strings.Join(ghostscriptCompressArgs("input.pdf", "output.pdf", "strong", true), "\n")
	if !strings.Contains(grayArgs, "-dSAFER") || !strings.Contains(grayArgs, "ColorConversionStrategy=Gray") {
		t.Fatalf("unsafe/incomplete Ghostscript args: %s", grayArgs)
	}
	if !strings.Contains(grayArgs, "-dPDFSETTINGS=/screen") {
		t.Fatalf("strong compression setting missing: %s", grayArgs)
	}

	if _, err := copyUploadedFile(filepath.Join(t.TempDir(), "too-large"), strings.NewReader("12345"), 4); err == nil {
		t.Fatal("oversize upload copy was accepted")
	}

	docxPath := filepath.Join(t.TempDir(), "minimal.docx")
	createTestOfficeArchive(t, docxPath, []string{"[Content_Types].xml", "word/document.xml"})
	if err := validateOfficeArchive(docxPath, ".docx"); err != nil {
		t.Fatalf("minimal DOCX rejected: %v", err)
	}
	if err := validateOfficeArchive(docxPath, ".xlsx"); err == nil {
		t.Fatal("DOCX content accepted as XLSX")
	}
	if officeArchiveWithinLimits(1024, fileToolArchiveMaxBytes+1, 2) {
		t.Fatal("archive expansion limit was not enforced")
	}
	if officeArchiveWithinLimits(1024, 200*1024*1024, 2) {
		t.Fatal("archive compression ratio limit was not enforced")
	}
	width, height, err := parseSIPSDimensions("/tmp/input.heic\n  pixelWidth: 3024\n  pixelHeight: 4032\n")
	if err != nil || width != 3024 || height != 4032 {
		t.Fatalf("sips dimensions=%dx%d err=%v", width, height, err)
	}
	if pages, err := parsePDFInfoPageCount("Title: fixture\nPages:          17\nEncrypted: no\n"); err != nil || pages != 17 {
		t.Fatalf("pdfinfo pages=%d err=%v", pages, err)
	}
	if _, err := parsePDFInfoPageCount("Pages: not-a-number\n"); err == nil {
		t.Fatal("invalid pdfinfo page count accepted")
	}
	if !supportedJavaVersion("openjdk version \"21.0.12\" 2026-07-21") || supportedJavaVersion("java version \"1.8.0_291\"") {
		t.Fatal("Java security baseline parsing is incorrect")
	}
	zipInput := filepath.Join(t.TempDir(), "zip-input.txt")
	if err := os.WriteFile(zipInput, []byte("output"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := zipFilesWithLimit(filepath.Join(t.TempDir(), "limited.zip"), []string{zipInput}, 1); !errors.Is(err, errFileToolOutputLimit) {
		t.Fatalf("ZIP output limit error=%v", err)
	}
}

func TestFileToolCapabilitiesFollowExecutableRequirements(t *testing.T) {
	service, err := newFileToolService(nil, t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	for name := range service.toolPaths {
		service.toolPaths[name] = filepath.Join(t.TempDir(), "missing-"+name)
	}
	if service.operationAvailable(fileToolDefinitions["pdf-ocr"]) {
		t.Fatal("OCR advertised without its executables")
	}
	for _, name := range fileToolDefinitions["pdf-ocr"].Required {
		path := filepath.Join(t.TempDir(), name)
		if err := os.WriteFile(path, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
			t.Fatal(err)
		}
		service.toolPaths[name] = path
	}
	if !service.operationAvailable(fileToolDefinitions["pdf-ocr"]) {
		t.Fatal("OCR unavailable with all required executables")
	}
	if service.operationAvailable(fileToolDefinitions["office-to-pdf"]) {
		t.Fatal("Office conversion advertised without soffice")
	}

	hwpPaths := map[string]string{}
	var testH2OHash string
	for _, name := range fileToolDefinitions["hwp-to-pdf"].Required {
		path := filepath.Join(t.TempDir(), name)
		contents := []byte("#!/bin/sh\nexit 0\n")
		if name == "java" {
			contents = []byte("#!/bin/sh\necho 'openjdk version \"21.0.12\"' >&2\n")
		}
		if name == "h2orestart" {
			jar := []byte("pinned-test-jar")
			path = filepath.Join(t.TempDir(), "H2Orestart")
			for _, relative := range []string{"META-INF/manifest.xml", "package.components", "registry/H2Orestart_filters.xcu", "registry/H2Orestart_types.xcu", "registry/TypeDetection.xcu"} {
				filePath := filepath.Join(path, relative)
				if err := os.MkdirAll(filepath.Dir(filePath), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filePath, []byte("fixture"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(path, "H2Orestart.jar"), jar, 0600); err != nil {
				t.Fatal(err)
			}
			digest := sha256.Sum256(jar)
			testH2OHash = fmt.Sprintf("%x", digest)
			if !validH2ORestartBundleWithHash(path, testH2OHash) {
				t.Fatal("valid H2Orestart bundled extension fixture rejected")
			}
			service.toolPaths[name] = path
			hwpPaths[name] = path
			continue
		}
		if err := os.WriteFile(path, contents, 0700); err != nil {
			t.Fatal(err)
		}
		hwpPaths[name] = path
		service.toolPaths[name] = path
	}
	if !isExecutableFile(hwpPaths["soffice"]) || !isExecutableFile(hwpPaths["java"]) || !validH2ORestartBundleWithHash(hwpPaths["h2orestart"], testH2OHash) {
		t.Fatal("HWP capability fixture setup failed")
	}
	service.dependencyAvailable = func(name, path string) bool {
		if name == "h2orestart" {
			return validH2ORestartBundleWithHash(path, testH2OHash)
		}
		return fileToolDependencyAvailable(name, path)
	}
	if !service.operationAvailable(fileToolDefinitions["hwp-to-pdf"]) {
		for _, name := range fileToolDefinitions["hwp-to-pdf"].Required {
			t.Logf("dependency %s path=%s available=%v version=%q", name, service.toolPaths[name], fileToolDependencyAvailable(name, service.toolPaths[name]), fileToolVersion(service.toolPaths[name], name))
		}
		t.Fatal("HWP conversion unavailable with pinned extension and Java 21")
	}
	if err := os.WriteFile(hwpPaths["java"], []byte("#!/bin/sh\necho 'java version \"1.8.0_291\"' >&2\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if service.operationAvailable(fileToolDefinitions["hwp-to-pdf"]) {
		t.Fatal("HWP conversion advertised with obsolete Java")
	}
}

func TestOCRPageLimitIsCheckedBeforeRasterization(t *testing.T) {
	workDir := t.TempDir()
	inputPath := filepath.Join(workDir, "input.pdf")
	if err := os.WriteFile(inputPath, []byte("%PDF-1.7\n"), 0600); err != nil {
		t.Fatal(err)
	}
	pdfinfo := filepath.Join(workDir, "pdfinfo")
	if err := os.WriteFile(pdfinfo, []byte("#!/bin/sh\necho 'Pages: 201'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(workDir, "pdftoppm-ran")
	pdftoppm := filepath.Join(workDir, "pdftoppm")
	if err := os.WriteFile(pdftoppm, []byte("#!/bin/sh\ntouch '"+marker+"'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	service := &fileToolService{toolPaths: map[string]string{"pdfinfo": pdfinfo, "pdftoppm": pdftoppm}}
	job := &fileToolJob{Inputs: []fileToolInput{{Path: inputPath, Extension: ".pdf"}}, Options: fileToolOptions{Language: "kor+eng"}}
	err := service.convertPDFOCR(context.Background(), job, workDir, filepath.Join(workDir, "result.pdf"))
	if err == nil || !strings.Contains(err.Error(), "page count outside limit") {
		t.Fatalf("expected preflight page limit error, got %v", err)
	}
	if _, statErr := os.Stat(marker); !os.IsNotExist(statErr) {
		t.Fatalf("pdftoppm ran before page limit rejection: %v", statErr)
	}
}

func TestFileToolSeatbeltDeniesOutsideReadsWritesAndNetwork(t *testing.T) {
	runtimeDir := t.TempDir()
	jobDir := t.TempDir()
	workDir := filepath.Join(jobDir, "work")
	if err := os.Mkdir(workDir, 0700); err != nil {
		t.Fatal(err)
	}
	inputPath := filepath.Join(jobDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.txt")
	if err := os.WriteFile(inputPath, []byte("allowed"), 0600); err != nil {
		t.Fatal(err)
	}
	outsideDir := t.TempDir()
	secretPath := filepath.Join(outsideDir, "secret.txt")
	outsideOutput := filepath.Join(outsideDir, "must-not-write.txt")
	if err := os.WriteFile(secretPath, []byte("secret"), 0600); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	script := filepath.Join(runtimeDir, "sandbox-probe")
	contents := "#!/bin/sh\n" +
		"case \"$1\" in -env:UserInstallation=*) shift ;; esac\n" +
		"/bin/cat \"$1\" > \"$2\" || exit 80\n" +
		"if /bin/cat \"$3\" >/dev/null 2>&1; then exit 81; fi\n" +
		"if echo denied > \"$4\" 2>/dev/null; then exit 82; fi\n" +
		"if /usr/bin/nc -z 127.0.0.1 \"$5\" >/dev/null 2>&1; then exit 83; fi\n" +
		"exit 0\n"
	if err := os.WriteFile(script, []byte(contents), 0700); err != nil {
		t.Fatal(err)
	}
	profileDir := filepath.Join(workDir, "libreoffice-profile")
	if err := os.Mkdir(profileDir, 0700); err != nil {
		t.Fatal(err)
	}
	profileURL := (&url.URL{Scheme: "file", Path: profileDir}).String()
	args := []string{"-env:UserInstallation=" + profileURL, inputPath, outputPath, secretPath, outsideOutput, port}
	if _, err := execFileToolCommand(context.Background(), script, args, workDir, workDir); err != nil {
		t.Fatal(err)
	}
	if contents, err := os.ReadFile(outputPath); err != nil || string(contents) != "allowed" {
		t.Fatalf("sandbox did not allow job IO: contents=%q err=%v", contents, err)
	}
	if _, err := os.Stat(outsideOutput); !os.IsNotExist(err) {
		t.Fatalf("sandbox allowed outside write: %v", err)
	}
}

func TestFileToolCloseIsIdempotent(t *testing.T) {
	service, err := newFileToolService(nil, t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		service.close()
		service.close()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("repeated close blocked")
	}
}

func TestFileToolRuntimeE2E(t *testing.T) {
	if os.Getenv("CWK_FILE_TOOLS_E2E") != "1" {
		t.Skip("set CWK_FILE_TOOLS_E2E=1 with real Intel iMac runtimes")
	}
	binDir := os.Getenv("FILE_TOOLS_BIN_DIR")
	if binDir == "" {
		t.Fatal("FILE_TOOLS_BIN_DIR is required")
	}
	hwpFixture := os.Getenv("CWK_HWP_FIXTURE")
	hwpxFixture := os.Getenv("CWK_HWPX_FIXTURE")
	officeFixtures := []struct {
		path      string
		extension string
	}{
		{os.Getenv("CWK_DOCX_FIXTURE"), ".docx"},
		{os.Getenv("CWK_XLSX_FIXTURE"), ".xlsx"},
		{os.Getenv("CWK_PPTX_FIXTURE"), ".pptx"},
	}
	for _, fixture := range append([]string{hwpFixture, hwpxFixture}, officeFixtures[0].path, officeFixtures[1].path, officeFixtures[2].path) {
		if !filepath.IsAbs(fixture) {
			t.Fatal("absolute DOCX/XLSX/PPTX/HWP/HWPX fixture paths are required")
		}
		if info, err := os.Stat(fixture); err != nil || !info.Mode().IsRegular() {
			t.Fatalf("missing HWP/HWPX fixture %q: %v", fixture, err)
		}
	}
	service, err := newFileToolService(nil, t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	for name := range service.toolPaths {
		if name == "sandbox-exec" || name == "h2orestart" {
			continue
		}
		service.toolPaths[name] = filepath.Join(binDir, name)
	}
	for name, definition := range fileToolDefinitions {
		if !service.operationAvailable(definition) {
			for _, dependency := range definition.Required {
				t.Logf("%s path=%s available=%v version=%q", dependency, service.toolPaths[dependency], service.dependencyAvailable(dependency, service.toolPaths[dependency]), fileToolVersion(service.toolPaths[dependency], dependency))
			}
			t.Fatalf("runtime operation unavailable: %s (%v)", name, definition.Required)
		}
	}

	fixtureJobDir := filepath.Join(service.rootDir, strings.Repeat("d", 32))
	fixtureWorkDir := filepath.Join(fixtureJobDir, "work")
	if err := os.MkdirAll(fixtureWorkDir, 0700); err != nil {
		t.Fatal(err)
	}
	postscript := filepath.Join(fixtureJobDir, "source.ps")
	if err := os.WriteFile(postscript, []byte("%!PS\n/Helvetica findfont 24 scalefont setfont\n72 720 moveto\n(File tools OCR TEST 123) show\nshowpage\n"), 0600); err != nil {
		t.Fatal(err)
	}
	sourcePDF := filepath.Join(fixtureWorkDir, "source.pdf")
	if _, err := execFileToolCommand(context.Background(), service.toolPaths["gs"], []string{
		"-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-sOutputFile=" + sourcePDF, postscript,
	}, fixtureWorkDir, fixtureWorkDir); err != nil {
		t.Fatal(err)
	}
	if err := validatePDFResult(sourcePDF); err != nil {
		t.Fatal(err)
	}

	runJob := func(operation, source, extension string, options fileToolOptions) *fileToolJob {
		t.Helper()
		id, err := newFileToolJobID()
		if err != nil {
			t.Fatal(err)
		}
		dir := filepath.Join(service.rootDir, id)
		if err := os.Mkdir(dir, 0700); err != nil {
			t.Fatal(err)
		}
		input := filepath.Join(dir, "input-001"+extension)
		if err := copyFileToolResource(source, input, fileToolMaxUploadBytes); err != nil {
			t.Fatal(err)
		}
		info, err := os.Stat(input)
		if err != nil {
			t.Fatal(err)
		}
		job := &fileToolJob{ID: id, Dir: dir, Operation: operation, Options: options, Inputs: []fileToolInput{{Path: input, Extension: extension, Size: info.Size()}}}
		if err := validateFileToolJob(job, fileToolDefinitions[operation]); err != nil {
			t.Fatalf("%s input validation: %v", operation, err)
		}
		if err := service.processJob(context.Background(), job); err != nil {
			t.Fatalf("%s runtime: %v", operation, err)
		}
		if _, err := os.Stat(job.ResultPath); err != nil {
			t.Fatalf("%s result: %v", operation, err)
		}
		return job
	}

	for _, operation := range []string{"pdf-compress", "pdf-grayscale", "pdf-repair"} {
		job := runJob(operation, sourcePDF, ".pdf", fileToolOptions{Quality: "balanced"})
		if err := validatePDFResult(job.ResultPath); err != nil {
			t.Fatalf("%s PDF: %v", operation, err)
		}
	}
	protected := runJob("pdf-protect", sourcePDF, ".pdf", fileToolOptions{Password: "e2e-password"})
	unlocked := runJob("pdf-unlock", protected.ResultPath, ".pdf", fileToolOptions{Password: "e2e-password"})
	if err := validatePDFResult(unlocked.ResultPath); err != nil {
		t.Fatal(err)
	}
	textJob := runJob("pdf-to-text", sourcePDF, ".pdf", fileToolOptions{})
	textContents, err := os.ReadFile(textJob.ResultPath)
	if err != nil || !bytes.Contains(textContents, []byte("File tools OCR TEST 123")) {
		t.Fatalf("text extraction result=%q err=%v", textContents, err)
	}
	ocr := runJob("pdf-ocr", sourcePDF, ".pdf", fileToolOptions{Language: "eng"})
	if err := validatePDFResult(ocr.ResultPath); err != nil {
		t.Fatal(err)
	}

	for _, fixture := range officeFixtures {
		office := runJob("office-to-pdf", fixture.path, fixture.extension, fileToolOptions{})
		if err := validatePDFResult(office.ResultPath); err != nil {
			t.Fatalf("%s PDF: %v", fixture.extension, err)
		}
	}
	for _, fixture := range []struct {
		path      string
		extension string
	}{{hwpFixture, ".hwp"}, {hwpxFixture, ".hwpx"}} {
		job := runJob("hwp-to-pdf", fixture.path, fixture.extension, fileToolOptions{})
		if err := validatePDFResult(job.ResultPath); err != nil {
			t.Fatalf("%s PDF: %v", fixture.extension, err)
		}
	}
}

func TestFileToolDefinitionsMatchServerCatalog(t *testing.T) {
	wanted := []string{
		"hwp-to-pdf", "office-to-pdf", "pdf-compress", "pdf-grayscale", "pdf-ocr",
		"pdf-protect", "pdf-repair", "pdf-to-text", "pdf-unlock",
	}
	for _, name := range wanted {
		if _, ok := fileToolDefinitions[name]; !ok {
			t.Fatalf("server catalog operation missing: %s", name)
		}
	}
	for _, extension := range []string{".odt", ".ods", ".odp"} {
		if !fileToolDefinitions["office-to-pdf"].Extensions[extension] {
			t.Fatalf("office extension missing: %s", extension)
		}
	}
	for _, extension := range []string{".hwp", ".hwpx"} {
		if !fileToolDefinitions["hwp-to-pdf"].Extensions[extension] {
			t.Fatalf("HWP extension missing: %s", extension)
		}
	}
	if fileToolDefinitions["hwp-to-pdf"].MaxFiles != 1 {
		t.Fatalf("HWP max files=%d", fileToolDefinitions["hwp-to-pdf"].MaxFiles)
	}
	for _, extension := range []string{".pdf", ".jpg", ".jpeg", ".png", ".heic"} {
		if !fileToolDefinitions["pdf-ocr"].Extensions[extension] {
			t.Fatalf("OCR extension missing: %s", extension)
		}
	}
}

func TestFileToolQueueSerializesAndCapsPendingWork(t *testing.T) {
	service, err := newFileToolService(nil, t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	started := make(chan string, 5)
	release := make(chan struct{}, 5)
	var active atomic.Int32
	var maximum atomic.Int32
	service.process = func(ctx context.Context, job *fileToolJob) error {
		current := active.Add(1)
		for {
			observed := maximum.Load()
			if current <= observed || maximum.CompareAndSwap(observed, current) {
				break
			}
		}
		started <- job.ID
		select {
		case <-release:
		case <-ctx.Done():
		}
		active.Add(-1)
		return nil
	}

	jobs := make([]*fileToolJob, 5)
	for index := range jobs {
		id := strings.Repeat(string(rune('a'+index)), 32)
		jobs[index] = &fileToolJob{ID: id, Operation: "pdf-to-text", Status: fileToolQueued, Dir: filepath.Join(service.rootDir, id)}
		if err := os.Mkdir(jobs[index].Dir, 0700); err != nil {
			t.Fatal(err)
		}
		service.mu.Lock()
		service.jobs[id] = jobs[index]
		service.mu.Unlock()
	}
	service.queue <- jobs[0]
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first job did not start")
	}
	for _, job := range jobs[1:4] {
		service.queue <- job
	}
	select {
	case service.queue <- jobs[4]:
		t.Fatal("queue accepted work beyond its pending capacity")
	default:
	}
	if maximum.Load() != 1 {
		t.Fatalf("parallel worker count=%d", maximum.Load())
	}
	release <- struct{}{}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("second job did not start after release")
	}
	if maximum.Load() != 1 {
		t.Fatalf("jobs overlapped: maximum=%d", maximum.Load())
	}
	for range 3 {
		release <- struct{}{}
	}
}

func TestFileToolOrphanAndTTLServerCleanup(t *testing.T) {
	root := t.TempDir()
	if _, err := prepareFileToolRoot(root); err != nil {
		t.Fatal(err)
	}
	orphanID := strings.Repeat("a", 32)
	orphan := filepath.Join(root, orphanID)
	if err := os.Mkdir(orphan, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(orphan, "secret"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	unrelated := filepath.Join(root, "keep-me")
	if err := os.Mkdir(unrelated, 0700); err != nil {
		t.Fatal(err)
	}
	service, err := newFileToolService(nil, root, "")
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatalf("orphan job remains: %v", err)
	}
	if _, err := os.Stat(unrelated); err != nil {
		t.Fatalf("unrelated directory was removed: %v", err)
	}

	finished := time.Date(2026, time.August, 27, 10, 0, 0, 0, time.UTC)
	jobID := strings.Repeat("b", 32)
	jobDir := filepath.Join(root, jobID)
	if err := os.Mkdir(jobDir, 0700); err != nil {
		t.Fatal(err)
	}
	job := &fileToolJob{ID: jobID, Dir: jobDir, Status: fileToolDone, FinishedAt: finished}
	service.jobs[jobID] = job
	if removed := service.cleanupExpiredJobs(finished.Add(fileToolResultTTL)); removed != 1 {
		t.Fatalf("removed=%d", removed)
	}
	if service.findJob(jobID) != nil {
		t.Fatal("expired job remains in memory")
	}
	if _, err := os.Stat(jobDir); !os.IsNotExist(err) {
		t.Fatalf("expired job directory remains: %v", err)
	}
}

func TestFileToolRootRequiresSentinelForExistingContent(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, strings.Repeat("a", 32)), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareFileToolRoot(root); err == nil {
		t.Fatal("existing nonempty directory without sentinel was accepted")
	}
}

func TestFileToolResultTimerExpiresExactly(t *testing.T) {
	service, err := newFileToolService(nil, t.TempDir(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer service.close()
	service.resultTTL = 20 * time.Millisecond
	id := strings.Repeat("c", 32)
	dir := filepath.Join(service.rootDir, id)
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	job := &fileToolJob{ID: id, Dir: dir, Status: fileToolDone, FinishedAt: time.Now()}
	service.jobs[id] = job
	service.scheduleExpiration(job)
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		service.mu.RLock()
		_, present := service.jobs[id]
		service.mu.RUnlock()
		if !present {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	service.mu.RLock()
	_, present := service.jobs[id]
	service.mu.RUnlock()
	if present {
		t.Fatal("result was not removed by its exact expiry timer")
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("expired result directory remains: %v", err)
	}
}

func createFileToolAuthRecord(t *testing.T, app core.App, collection *core.Collection, id, email string) (*core.Record, string) {
	t.Helper()
	record := core.NewRecord(collection)
	record.Id = id
	record.Set("email", email)
	record.SetPassword("file-tools-password-123")
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	token, err := record.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return record, token
}

func fileToolMultipartBody(t *testing.T, operation, filename string, contents []byte, options string) (io.Reader, string) {
	t.Helper()
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	if err := writer.WriteField("operation", operation); err != nil {
		t.Fatal(err)
	}
	if err := writer.WriteField("options", options); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("files", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(contents); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(buffer.Bytes()), writer.FormDataContentType()
}

func fileToolAPIRequest(mux http.Handler, method, path string, body io.Reader, contentType, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, body)
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func createTestOfficeArchive(t *testing.T, targetPath string, entries []string) {
	t.Helper()
	file, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, name := range entries {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte("test")); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}
