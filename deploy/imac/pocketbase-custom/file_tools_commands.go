package main

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
)

const fileToolOCRMaxPages = 200

func (service *fileToolService) processJob(ctx context.Context, job *fileToolJob) error {
	workDir := filepath.Join(job.Dir, "work")
	outputDir := filepath.Join(workDir, "output")
	if err := os.Mkdir(workDir, 0700); err != nil {
		return err
	}
	if err := os.Mkdir(outputDir, 0700); err != nil {
		return err
	}

	var resultPath, resultName string
	var err error
	switch job.Operation {
	case "office-to-pdf", "hwp-to-pdf":
		resultPath, resultName, err = service.convertOfficeToPDF(ctx, job, workDir, outputDir)
	case "pdf-ocr":
		resultName = "ocr-searchable.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.convertPDFOCR(ctx, job, workDir, resultPath)
	case "pdf-compress":
		resultName = "compressed.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.compressPDF(ctx, job, workDir, resultPath)
	case "pdf-protect":
		resultName = "protected.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.protectPDF(ctx, job, workDir, resultPath)
	case "pdf-unlock":
		resultName = "unlocked.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.unlockPDF(ctx, job, workDir, resultPath)
	case "pdf-repair":
		resultName = "repaired.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.repairPDF(ctx, job, workDir, resultPath)
	case "pdf-grayscale":
		resultName = "grayscale.pdf"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.grayscalePDF(ctx, job, workDir, resultPath)
	case "pdf-to-text":
		resultName = "extracted.txt"
		resultPath = filepath.Join(outputDir, resultName)
		err = service.extractPDFText(ctx, job, workDir, resultPath)
	default:
		err = errors.New("unknown file tool operation")
	}
	if err != nil {
		return err
	}
	if err := validateFileToolResult(resultPath); err != nil {
		return err
	}
	job.mu.Lock()
	job.ResultPath = resultPath
	job.ResultName = resultName
	job.ResultMIME = resultMIMEForName(resultName)
	job.mu.Unlock()
	return nil
}

func (service *fileToolService) convertOfficeToPDF(ctx context.Context, job *fileToolJob, workDir, outputDir string) (string, string, error) {
	profileDir := filepath.Join(workDir, "libreoffice-profile")
	if err := os.Mkdir(profileDir, 0700); err != nil {
		return "", "", err
	}
	profileURL := (&url.URL{Scheme: "file", Path: profileDir}).String()
	var javaEnvironment []string
	if job.Operation == "hwp-to-pdf" {
		javaHome, err := javaHomeForExecutable(service.toolPaths["java"])
		if err != nil {
			return "", "", err
		}
		javaEnvironment = []string{"JAVA_HOME=" + javaHome}
		if !validH2ORestartBundle(service.toolPaths["h2orestart"]) {
			return "", "", errors.New("pinned HWP/HWPX converter is unavailable")
		}
	}
	outputs := make([]string, 0, len(job.Inputs))
	var outputBytes int64
	for _, input := range job.Inputs {
		args := officeToPDFArgs(input.Path, outputDir, profileURL)
		if _, err := execFileToolCommandWithEnv(ctx, service.toolPaths["soffice"], args, workDir, workDir, javaEnvironment); err != nil {
			return "", "", err
		}
		expected := filepath.Join(outputDir, strings.TrimSuffix(filepath.Base(input.Path), filepath.Ext(input.Path))+".pdf")
		if err := validatePDFResult(expected); err != nil {
			return "", "", err
		}
		size, err := regularFileSize(expected)
		if err != nil {
			return "", "", err
		}
		outputBytes += size
		if outputBytes > fileToolMaxOutputBytes {
			return "", "", errors.New("combined Office output exceeds size limit")
		}
		outputs = append(outputs, expected)
	}
	if len(outputs) == 1 {
		return outputs[0], "converted.pdf", nil
	}
	archivePath := filepath.Join(outputDir, "converted-pdfs.zip")
	if err := zipFiles(archivePath, outputs); err != nil {
		return "", "", err
	}
	return archivePath, "converted-pdfs.zip", nil
}

func copyFileToolResource(sourcePath, targetPath string, maximum int64) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return errors.New("required file tool resource unavailable")
	}
	defer source.Close()
	target, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	written, copyErr := io.Copy(target, io.LimitReader(source, maximum+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		return errors.New("failed to stage file tool resource")
	}
	if written > maximum {
		return errors.New("file tool resource exceeds size limit")
	}
	return nil
}

func javaHomeForExecutable(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", errors.New("could not resolve the pinned Java runtime")
	}
	home := filepath.Dir(filepath.Dir(resolved))
	if !isExecutableFile(filepath.Join(home, "bin", "java")) {
		return "", errors.New("pinned Java runtime has an invalid home directory")
	}
	return home, nil
}

func officeToPDFArgs(inputPath, outputDir, profileURL string) []string {
	return []string{
		"--headless", "--invisible", "--nologo", "--nodefault", "--norestore", "--nofirststartwizard", "--nolockcheck",
		"-env:UserInstallation=" + profileURL,
		"--convert-to", officePDFExportFilter(inputPath), "--outdir", outputDir, inputPath,
	}
}

func officePDFExportFilter(inputPath string) string {
	switch strings.ToLower(filepath.Ext(inputPath)) {
	case ".xls", ".xlsx", ".ods":
		return "pdf:calc_pdf_Export"
	case ".ppt", ".pptx", ".odp":
		return "pdf:impress_pdf_Export"
	default:
		return "pdf:writer_pdf_Export"
	}
}

func (service *fileToolService) convertPDFOCR(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	pageCounts := make([]int, len(job.Inputs))
	totalPages := 0
	for inputIndex, input := range job.Inputs {
		pageCount := 1
		if input.Extension == ".pdf" {
			output, err := execFileToolCommand(ctx, service.toolPaths["pdfinfo"], []string{input.Path}, workDir, workDir)
			if err != nil {
				return err
			}
			pageCount, err = parsePDFInfoPageCount(output)
			if err != nil {
				return err
			}
		}
		if pageCount > fileToolOCRMaxPages-totalPages {
			return fmt.Errorf("OCR page count outside limit: %d", totalPages+pageCount)
		}
		pageCounts[inputIndex] = pageCount
		totalPages += pageCount
	}
	if totalPages == 0 {
		return errors.New("OCR produced no pages")
	}

	pagePDFs := make([]string, 0, totalPages)
	var generatedBytes int64
	for inputIndex, input := range job.Inputs {
		for page := 1; page <= pageCounts[inputIndex]; page++ {
			imagePath := input.Path
			removeImage := false
			if input.Extension == ".pdf" {
				pageBase := filepath.Join(workDir, fmt.Sprintf("source-%03d-page-%04d", inputIndex+1, page))
				if _, err := execFileToolCommand(ctx, service.toolPaths["pdftoppm"], []string{
					"-f", strconv.Itoa(page), "-l", strconv.Itoa(page), "-singlefile", "-r", "200", "-scale-to", "4000", "-png", input.Path, pageBase,
				}, workDir, workDir); err != nil {
					return err
				}
				imagePath = pageBase + ".png"
				removeImage = true
			} else if input.Extension == ".heic" {
				inspectOutput, err := execFileToolCommand(ctx, service.toolPaths["sips"], []string{
					"-g", "pixelWidth", "-g", "pixelHeight", input.Path,
				}, workDir, workDir)
				if err != nil {
					return err
				}
				width, height, err := parseSIPSDimensions(inspectOutput)
				if err != nil || width > 20_000 || height > 20_000 || uint64(width)*uint64(height) > fileToolImageMaxPixels {
					return errors.New("HEIC image resolution exceeds safe limit")
				}
				imagePath = filepath.Join(workDir, fmt.Sprintf("source-%03d.png", inputIndex+1))
				if _, err := execFileToolCommand(ctx, service.toolPaths["sips"], []string{
					"-s", "format", "png", input.Path, "--out", imagePath,
				}, workDir, workDir); err != nil {
					return err
				}
				removeImage = true
			}
			if removeImage {
				if err := validateIntermediateFile(imagePath, fileToolOCRPageMaxBytes); err != nil {
					_ = os.Remove(imagePath)
					return err
				}
			}
			pageIndex := len(pagePDFs) + 1
			outputBase := filepath.Join(workDir, fmt.Sprintf("ocr-%04d", pageIndex))
			_, commandErr := execFileToolCommand(ctx, service.toolPaths["tesseract"], []string{
				imagePath, outputBase, "-l", job.Options.Language, "pdf",
			}, workDir, workDir)
			if removeImage {
				_ = os.Remove(imagePath)
			}
			if commandErr != nil {
				return commandErr
			}
			pagePath := outputBase + ".pdf"
			if err := validatePDFResult(pagePath); err != nil {
				return err
			}
			pageBytes, err := regularFileSize(pagePath)
			if err != nil {
				return err
			}
			generatedBytes += pageBytes
			if generatedBytes > fileToolOCRWorkMaxBytes {
				return errors.New("OCR intermediate output exceeds size limit")
			}
			pagePDFs = append(pagePDFs, pagePath)
		}
	}
	args := []string{"--empty", "--pages"}
	args = append(args, pagePDFs...)
	args = append(args, "--", outputPath)
	if _, err := execFileToolCommand(ctx, service.toolPaths["qpdf"], args, workDir, workDir); err != nil {
		return err
	}
	return service.checkPDF(ctx, outputPath, workDir)
}

func parsePDFInfoPageCount(output string) (int, error) {
	for _, line := range strings.Split(output, "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 || !strings.EqualFold(strings.TrimSpace(parts[0]), "Pages") {
			continue
		}
		count, err := strconv.Atoi(strings.TrimSpace(parts[1]))
		if err == nil && count > 0 {
			return count, nil
		}
	}
	return 0, errors.New("could not determine PDF page count")
}

func validateIntermediateFile(path string, limit int64) error {
	size, err := regularFileSize(path)
	if err != nil {
		return err
	}
	if size > limit {
		return errors.New("OCR rasterized page exceeds size limit")
	}
	return nil
}

func regularFileSize(path string) (int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	if !info.Mode().IsRegular() {
		return 0, errors.New("intermediate output is not a regular file")
	}
	return info.Size(), nil
}

func parseSIPSDimensions(output string) (uint64, uint64, error) {
	var width, height uint64
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "pixelWidth:") {
			width, _ = strconv.ParseUint(strings.TrimSpace(strings.TrimPrefix(line, "pixelWidth:")), 10, 64)
		}
		if strings.HasPrefix(line, "pixelHeight:") {
			height, _ = strconv.ParseUint(strings.TrimSpace(strings.TrimPrefix(line, "pixelHeight:")), 10, 64)
		}
	}
	if width == 0 || height == 0 {
		return 0, 0, errors.New("invalid sips dimensions")
	}
	return width, height, nil
}

func numberedFiles(pattern, marker string) ([]string, error) {
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	type numberedPath struct {
		path   string
		number int
	}
	numbered := make([]numberedPath, 0, len(paths))
	for _, path := range paths {
		base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		position := strings.LastIndex(base, marker)
		if position < 0 {
			continue
		}
		number, parseErr := strconv.Atoi(base[position+len(marker):])
		if parseErr != nil || number < 1 {
			continue
		}
		numbered = append(numbered, numberedPath{path: path, number: number})
	}
	sort.Slice(numbered, func(i, j int) bool { return numbered[i].number < numbered[j].number })
	result := make([]string, len(numbered))
	for index, item := range numbered {
		result[index] = item.path
	}
	return result, nil
}

func (service *fileToolService) compressPDF(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	args := ghostscriptCompressArgs(job.Inputs[0].Path, outputPath, job.Options.Quality, job.Options.Grayscale)
	if _, err := execFileToolCommand(ctx, service.toolPaths["gs"], args, workDir, workDir); err != nil {
		return err
	}
	return validatePDFResult(outputPath)
}

func (service *fileToolService) grayscalePDF(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	args := []string{
		"-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dSAFER",
		"-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray", "-sOutputFile=" + outputPath,
		job.Inputs[0].Path,
	}
	if _, err := execFileToolCommand(ctx, service.toolPaths["gs"], args, workDir, workDir); err != nil {
		return err
	}
	return validatePDFResult(outputPath)
}

func ghostscriptCompressArgs(inputPath, outputPath, quality string, grayscale bool) []string {
	setting := "/ebook"
	switch quality {
	case "strong":
		setting = "/screen"
	case "light":
		setting = "/printer"
	}
	args := []string{
		"-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", "-dPDFSETTINGS=" + setting,
		"-dNOPAUSE", "-dQUIET", "-dBATCH", "-dSAFER", "-sOutputFile=" + outputPath,
	}
	if grayscale {
		args = append(args, "-sColorConversionStrategy=Gray", "-dProcessColorModel=/DeviceGray")
	}
	return append(args, inputPath)
}

func (service *fileToolService) protectPDF(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	args := []string{"--encrypt", job.Options.Password, job.Options.Password, "256", "--", job.Inputs[0].Path, outputPath}
	if err := service.execSensitiveQPDF(ctx, workDir, args); err != nil {
		return err
	}
	return validatePDFResult(outputPath)
}

func (service *fileToolService) unlockPDF(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	args := []string{"--password=" + job.Options.Password, "--decrypt", job.Inputs[0].Path, outputPath}
	if err := service.execSensitiveQPDF(ctx, workDir, args); err != nil {
		return err
	}
	return service.checkPDF(ctx, outputPath, workDir)
}

func (service *fileToolService) repairPDF(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	if _, err := execFileToolCommand(ctx, service.toolPaths["qpdf"], []string{
		"--object-streams=generate", job.Inputs[0].Path, outputPath,
	}, workDir, workDir); err != nil {
		return err
	}
	return service.checkPDF(ctx, outputPath, workDir)
}

func (service *fileToolService) checkPDF(ctx context.Context, path, workDir string) error {
	if err := validatePDFResult(path); err != nil {
		return err
	}
	_, err := execFileToolCommand(ctx, service.toolPaths["qpdf"], []string{"--check", path}, workDir, workDir)
	return err
}

func (service *fileToolService) extractPDFText(ctx context.Context, job *fileToolJob, workDir, outputPath string) error {
	_, err := execFileToolCommand(ctx, service.toolPaths["pdftotext"], []string{
		"-layout", "-enc", "UTF-8", job.Inputs[0].Path, outputPath,
	}, workDir, workDir)
	return err
}

func (service *fileToolService) execSensitiveQPDF(ctx context.Context, workDir string, args []string) error {
	argsPath := filepath.Join(workDir, "qpdf-args")
	var contents strings.Builder
	for _, arg := range args {
		if strings.ContainsAny(arg, "\x00\r\n") {
			return errors.New("unsafe qpdf argument")
		}
		contents.WriteString(arg)
		contents.WriteByte('\n')
	}
	if err := os.WriteFile(argsPath, []byte(contents.String()), 0600); err != nil {
		return err
	}
	defer os.Remove(argsPath)
	_, err := execFileToolCommand(ctx, service.toolPaths["qpdf"], []string{"@" + argsPath}, workDir, workDir)
	return err
}

func validatePDFResult(path string) error {
	if err := validateFileToolResult(path); err != nil {
		return err
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	header := make([]byte, 5)
	if _, err := io.ReadFull(file, header); err != nil || !bytes.Equal(header, []byte("%PDF-")) {
		return errors.New("output is not a PDF")
	}
	return nil
}

func validateFileToolResult(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("output is not a regular file")
	}
	if info.Size() > fileToolMaxOutputBytes {
		return errors.New("output exceeds size limit")
	}
	return nil
}

type boundedCommandOutput struct {
	buffer    bytes.Buffer
	remaining int
}

func (writer *boundedCommandOutput) Write(data []byte) (int, error) {
	originalLength := len(data)
	if writer.remaining > 0 {
		if len(data) > writer.remaining {
			data = data[:writer.remaining]
		}
		_, _ = writer.buffer.Write(data)
		writer.remaining -= len(data)
	}
	return originalLength, nil
}

func execFileToolCommand(ctx context.Context, executable string, args []string, homeDir, tempDir string) (string, error) {
	return execFileToolCommandWithEnv(ctx, executable, args, homeDir, tempDir, nil)
}

func execFileToolCommandWithEnv(ctx context.Context, executable string, args []string, homeDir, tempDir string, extraEnvironment []string) (string, error) {
	if !isExecutableFile(executable) {
		return "", fmt.Errorf("required executable unavailable")
	}
	sandboxRequested := homeDir != "" || tempDir != ""
	if homeDir == "" {
		homeDir = os.TempDir()
	}
	if tempDir == "" {
		tempDir = os.TempDir()
	}
	for _, entry := range extraEnvironment {
		if strings.ContainsAny(entry, "\x00\r\n") || !strings.Contains(entry, "=") {
			return "", errors.New("invalid file tool environment")
		}
	}
	commandExecutable := executable
	commandArgs := args
	var sandboxProfile string
	if sandboxRequested {
		var sandboxErr error
		commandExecutable, commandArgs, sandboxProfile, sandboxErr = sandboxFileToolCommand(executable, args, homeDir, tempDir, extraEnvironment)
		if sandboxErr != nil {
			return "", sandboxErr
		}
		defer os.Remove(sandboxProfile)
	}
	command := exec.CommandContext(ctx, commandExecutable, commandArgs...)
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	command.Cancel = func() error {
		if command.Process == nil {
			return nil
		}
		err := syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) {
			return nil
		}
		return err
	}
	command.WaitDelay = 2 * time.Second
	command.Dir = tempDir
	command.Env = []string{
		"HOME=" + homeDir,
		"TMPDIR=" + tempDir,
		"TMP=" + tempDir,
		"TEMP=" + tempDir,
		"XDG_RUNTIME_DIR=" + tempDir,
		"LANG=en_US.UTF-8",
		"LC_ALL=en_US.UTF-8",
		"__CF_USER_TEXT_ENCODING=0x1F5:0x8000100:0x8000100",
		"ApplePersistenceIgnoreState=YES",
		"NSQuitAlwaysKeepsWindows=NO",
		"PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
	}
	for _, entry := range extraEnvironment {
		command.Env = append(command.Env, entry)
	}
	output := &boundedCommandOutput{remaining: fileToolCommandLogBytes}
	command.Stdout = output
	command.Stderr = output
	if err := command.Run(); err != nil {
		message := strings.TrimSpace(output.buffer.String())
		if message != "" {
			return message, fmt.Errorf("file tool command failed: %w: %s", err, message)
		}
		return "", fmt.Errorf("file tool command failed: %w", err)
	}
	return strings.TrimSpace(output.buffer.String()), nil
}

func sandboxFileToolCommand(executable string, args []string, homeDir, tempDir string, extraEnvironment []string) (string, []string, string, error) {
	const sandboxExecutable = "/usr/bin/sandbox-exec"
	if !isExecutableFile(sandboxExecutable) {
		return "", nil, "", errors.New("required macOS file tool sandbox unavailable")
	}
	workDir, err := filepath.EvalSymlinks(homeDir)
	if err != nil {
		return "", nil, "", errors.New("file tool sandbox work directory is invalid")
	}
	temporaryDir, err := filepath.EvalSymlinks(tempDir)
	if err != nil || temporaryDir != workDir {
		return "", nil, "", errors.New("file tool sandbox requires one isolated work directory")
	}
	jobDir := filepath.Dir(workDir)
	resolvedExecutable, err := filepath.EvalSymlinks(executable)
	if err != nil || !filepath.IsAbs(resolvedExecutable) || !isExecutableFile(resolvedExecutable) {
		return "", nil, "", errors.New("file tool executable path is invalid")
	}
	readPaths := []string{
		"/System", "/usr", "/bin", "/sbin", "/Library", "/dev", "/private/etc", "/private/var/db/timezone",
		"/Applications/LibreOffice.app", "/Applications/LibreOfficeDev.app",
		jobDir, fileToolRuntimeReadRoot(resolvedExecutable),
	}
	for _, entry := range extraEnvironment {
		if strings.HasPrefix(entry, "JAVA_HOME=") {
			javaHome := strings.TrimPrefix(entry, "JAVA_HOME=")
			resolvedJavaHome, resolveErr := filepath.EvalSymlinks(javaHome)
			if resolveErr != nil || !filepath.IsAbs(resolvedJavaHome) {
				return "", nil, "", errors.New("file tool Java home is invalid")
			}
			readPaths = append(readPaths, resolvedJavaHome)
		}
	}
	libreOfficePipe, err := libreOfficePipePath(args, workDir)
	if err != nil {
		return "", nil, "", err
	}
	profile := buildFileToolSandboxProfile(readPaths, workDir, libreOfficePipe)
	id, err := newFileToolJobID()
	if err != nil {
		return "", nil, "", errors.New("could not create file tool sandbox profile")
	}
	profilePath := filepath.Join(workDir, ".seatbelt-"+id+".sb")
	if err := os.WriteFile(profilePath, []byte(profile), 0600); err != nil {
		return "", nil, "", errors.New("could not write file tool sandbox profile")
	}
	sandboxArgs := []string{"-f", profilePath, resolvedExecutable}
	sandboxArgs = append(sandboxArgs, args...)
	return sandboxExecutable, sandboxArgs, profilePath, nil
}

func fileToolRuntimeReadRoot(executable string) string {
	if marker := strings.Index(executable, ".app/Contents/"); marker >= 0 {
		return executable[:marker+len(".app")]
	}
	if marker := strings.LastIndex(executable, "/bin/"); marker > 0 {
		return executable[:marker]
	}
	return filepath.Dir(executable)
}

func libreOfficePipePath(args []string, workDir string) (string, error) {
	const prefix = "-env:UserInstallation="
	for _, argument := range args {
		if !strings.HasPrefix(argument, prefix) {
			continue
		}
		installationURL := strings.TrimPrefix(argument, prefix)
		parsed, err := url.Parse(installationURL)
		if err != nil || parsed.Scheme != "file" || parsed.Host != "" || !filepath.IsAbs(parsed.Path) {
			return "", errors.New("LibreOffice sandbox profile path is invalid")
		}
		resolvedProfile, err := filepath.EvalSymlinks(parsed.Path)
		if err != nil || (resolvedProfile != workDir && !pathInsideDirectory(workDir, resolvedProfile)) {
			return "", errors.New("LibreOffice sandbox profile escapes the isolated work directory")
		}
		canonicalInstallationURL := (&url.URL{Scheme: "file", Path: resolvedProfile}).String()

		// LibreOffice hashes the UTF-16 UserInstallation URL and renders each MD5
		// byte without zero padding when naming its mandatory local IPC socket.
		// Reproducing that exact literal lets Seatbelt permit only this socket,
		// without granting general writes outside the job directory.
		units := utf16.Encode([]rune(canonicalInstallationURL))
		encoded := make([]byte, len(units)*2)
		for index, unit := range units {
			binary.LittleEndian.PutUint16(encoded[index*2:], unit)
		}
		digest := md5.Sum(encoded) // #nosec G401 -- compatibility identifier, not cryptography.
		var hash strings.Builder
		for _, value := range digest {
			hash.WriteString(strconv.FormatUint(uint64(value), 16))
		}
		return fmt.Sprintf("/tmp/OSL_PIPE_%d_SingleOfficeIPC_%s", os.Geteuid(), hash.String()), nil
	}
	return "", nil
}

func buildFileToolSandboxProfile(readPaths []string, writePath, libreOfficePipe string) string {
	unique := map[string]bool{}
	var profile strings.Builder
	profile.WriteString("(version 1)\n(deny default)\n")
	profile.WriteString("(allow process*)\n(allow signal (target same-sandbox))\n")
	profile.WriteString("(allow sysctl-read)\n(allow mach-lookup)\n(allow mach-register)\n")
	profile.WriteString("(allow ipc-posix*)\n(allow iokit-open)\n(allow iokit-get-properties)\n")
	profile.WriteString("(allow file-read-metadata)\n(allow file-read*\n  (literal \"/\")\n")
	for ancestor := filepath.Dir(filepath.Dir(writePath)); ancestor != "/" && ancestor != "."; ancestor = filepath.Dir(ancestor) {
		profile.WriteString("  (literal \"")
		profile.WriteString(seatbeltEscape(ancestor))
		profile.WriteString("\")\n")
	}
	for _, item := range readPaths {
		cleaned := filepath.Clean(item)
		if !filepath.IsAbs(cleaned) || unique[cleaned] {
			continue
		}
		unique[cleaned] = true
		profile.WriteString("  (subpath \"")
		profile.WriteString(seatbeltEscape(cleaned))
		profile.WriteString("\")\n")
	}
	profile.WriteString(")\n(allow file-write*\n  (subpath \"")
	profile.WriteString(seatbeltEscape(filepath.Clean(writePath)))
	profile.WriteString("\")\n  (literal \"/dev/null\")\n)\n")
	if libreOfficePipe != "" {
		pipePaths := []string{libreOfficePipe}
		if strings.HasPrefix(libreOfficePipe, "/tmp/") {
			pipePaths = append(pipePaths, "/private"+libreOfficePipe)
		}
		profile.WriteString("(allow file*\n  (subpath \"")
		profile.WriteString(seatbeltEscape(filepath.Clean(writePath)))
		profile.WriteString("\")\n  (subpath \"")
		profile.WriteString(seatbeltEscape(filepath.Dir(filepath.Clean(writePath))))
		profile.WriteString("\")\n  (literal \"/private/tmp\")\n")
		if userHome, err := os.UserHomeDir(); err == nil {
			for _, relative := range []string{"Library/Java", ".java", ".oracle_jre_usage"} {
				profile.WriteString("  (subpath \"")
				profile.WriteString(seatbeltEscape(filepath.Join(userHome, relative)))
				profile.WriteString("\")\n")
			}
		}
		for _, pipePath := range pipePaths {
			profile.WriteString("  (literal \"")
			profile.WriteString(seatbeltEscape(pipePath))
			profile.WriteString("\")\n")
		}
		profile.WriteString(")\n")
		profile.WriteString("(allow file-map-executable\n")
		for _, item := range readPaths {
			cleaned := filepath.Clean(item)
			if !filepath.IsAbs(cleaned) {
				continue
			}
			profile.WriteString("  (subpath \"")
			profile.WriteString(seatbeltEscape(cleaned))
			profile.WriteString("\")\n")
		}
		profile.WriteString(")\n")
		profile.WriteString("(allow file-read* file-write* file-unlink\n")
		for _, pipePath := range pipePaths {
			profile.WriteString("  (literal \"")
			profile.WriteString(seatbeltEscape(pipePath))
			profile.WriteString("\")\n")
		}
		profile.WriteString(")\n")
		profile.WriteString("(allow network-bind network-inbound network-outbound\n")
		for _, pipePath := range pipePaths {
			profile.WriteString("  (literal \"")
			profile.WriteString(seatbeltEscape(pipePath))
			profile.WriteString("\")\n")
		}
		profile.WriteString(")\n")
	}
	return profile.String()
}

func seatbeltEscape(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	return strings.ReplaceAll(value, "\"", "\\\"")
}
