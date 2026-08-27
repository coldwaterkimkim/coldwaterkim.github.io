#!/usr/bin/env bash
set -euo pipefail

MODE="install"
if [[ "${1:-}" == "--check-only" ]]; then
    MODE="check"
elif [[ $# -ne 0 ]]; then
    echo "Usage: bash deploy/imac/install-file-tools-runtime.sh [--check-only]" >&2
    exit 2
fi

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "x86_64" ]]; then
    echo "This installer is intended for the Intel iMac (macOS x86_64)." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGET_DIR="${FILE_TOOLS_TARGET_DIR:-$REPO_ROOT/.local-bin}"
ENV_DIR="${FILE_TOOLS_ENV_DIR:-$HOME/.local/share/coldwaterkim/file-tools-runtime}"
BOOTSTRAP_DIR="${FILE_TOOLS_BOOTSTRAP_DIR:-$HOME/.cache/coldwaterkim/file-tools-runtime}"
MICROMAMBA_ROOT="$BOOTSTRAP_DIR/mamba-root"
MICROMAMBA_BIN="$BOOTSTRAP_DIR/micromamba"

MICROMAMBA_VERSION="2.9.0"
MICROMAMBA_SHA256="0426ecdc41636d369f57b8fe6acbf4385a69eca45b56d9ee7d3a840a9965d44f"
MICROMAMBA_URL="https://micro.mamba.pm/api/micromamba/osx-64/${MICROMAMBA_VERSION}"
CONDA_PACKAGES=(
    "qpdf=12.3.2"
    "poppler=26.07.0"
    "ghostscript=10.07.1"
    "tesseract=5.5.3"
)

TEMURIN_VERSION="21.0.10+7"
TEMURIN_ARCHIVE_VERSION="21.0.10_7"
TEMURIN_SHA256="7484d5d4cdb02fc17a842ab86ddac2524a0365066659c46b2e258c64152379cd"
TEMURIN_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B7/OpenJDK21U-jdk_x64_mac_hotspot_${TEMURIN_ARCHIVE_VERSION}.tar.gz"
TEMURIN_BUNDLE="${FILE_TOOLS_JAVA_BUNDLE:-$HOME/Library/Java/JavaVirtualMachines/cwk-temurin-21.jdk}"

LIBREOFFICE_VERSION="26.2.5"
LIBREOFFICE_SHA256="e26180298685274b54aa7fe6e1101c65465a372f457a6748ebd642720811db36"
LIBREOFFICE_URL="https://download.documentfoundation.org/libreoffice/stable/${LIBREOFFICE_VERSION}/mac/x86_64/LibreOffice_${LIBREOFFICE_VERSION}_MacOS_x86-64.dmg"
LIBREOFFICE_APP="/Applications/LibreOffice.app"

TESSDATA_VERSION="4.1.0"
TESSDATA_KOR_SHA256="6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2"
TESSDATA_KOR_URL="https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${TESSDATA_VERSION}/kor.traineddata"

H2ORESTART_VERSION="0.7.13"
H2ORESTART_SHA256="726230215dabe450bd617f9acac52376fd76f57c77158bd03b3ef9fe0c7e64fd"
H2ORESTART_URL="https://github.com/ebandal/H2Orestart/releases/download/v${H2ORESTART_VERSION}/H2Orestart.oxt"
H2ORESTART_TARGET="$TARGET_DIR/H2Orestart.oxt"
H2ORESTART_BUNDLED_DIR="$LIBREOFFICE_APP/Contents/Resources/extensions/H2Orestart"
H2ORESTART_JAR_SHA256="7fc83e85cc6b0ab8be1dcdd8d6da30f137199212ec88a493c033b58e6fcfde67"

TOOLS=(qpdf pdfinfo pdftoppm pdftotext tesseract gs soffice unopkg java sips)

sha256_file() {
    shasum -a 256 "$1" | awk '{print $1}'
}

download_verified() {
    local url="$1"
    local expected_sha="$2"
    local output="$3"
    curl --fail --location --silent --show-error "$url" --output "$output"
    local actual_sha
    actual_sha="$(sha256_file "$output")"
    if [[ "$actual_sha" != "$expected_sha" ]]; then
        echo "Checksum mismatch for $url: $actual_sha" >&2
        exit 1
    fi
}

install_micromamba() {
    if [[ -x "$MICROMAMBA_BIN" ]] && [[ "$($MICROMAMBA_BIN --version)" == "$MICROMAMBA_VERSION" ]]; then
        return
    fi
    mkdir -p "$BOOTSTRAP_DIR"
    local download_dir
    download_dir="$(mktemp -d /tmp/cwk-micromamba.XXXXXX)"
    download_verified "$MICROMAMBA_URL" "$MICROMAMBA_SHA256" "$download_dir/micromamba.tar.bz2"
    tar -xjf "$download_dir/micromamba.tar.bz2" -C "$download_dir" bin/micromamba
    install -m 755 "$download_dir/bin/micromamba" "$MICROMAMBA_BIN"
    find "$download_dir" -depth -delete
}

install_conda_tools() {
    install_micromamba
    local action="create"
    if [[ -f "$ENV_DIR/conda-meta/history" ]]; then
        action="install"
    fi
    MAMBA_ROOT_PREFIX="$MICROMAMBA_ROOT" "$MICROMAMBA_BIN" "$action" \
        --yes \
        --prefix "$ENV_DIR" \
        --channel conda-forge \
        --strict-channel-priority \
        "${CONDA_PACKAGES[@]}"

    local tessdata_dir="$ENV_DIR/share/tessdata"
    mkdir -p "$tessdata_dir"
    local download_dir
    download_dir="$(mktemp -d /tmp/cwk-tessdata.XXXXXX)"
    download_verified "$TESSDATA_KOR_URL" "$TESSDATA_KOR_SHA256" "$download_dir/kor.traineddata"
    install -m 644 "$download_dir/kor.traineddata" "$tessdata_dir/kor.traineddata"
    find "$download_dir" -depth -delete
}

install_temurin() {
    if [[ -x "$TEMURIN_BUNDLE/Contents/Home/bin/java" ]] \
        && "$TEMURIN_BUNDLE/Contents/Home/bin/java" -version 2>&1 | grep -q '"21\.0\.10'; then
        return
    fi
    local download_dir
    download_dir="$(mktemp -d /tmp/cwk-temurin.XXXXXX)"
    download_verified "$TEMURIN_URL" "$TEMURIN_SHA256" "$download_dir/temurin.tar.gz"
    tar -xzf "$download_dir/temurin.tar.gz" -C "$download_dir"
    local source_bundle
    source_bundle="$(find "$download_dir" -maxdepth 6 -type f -path '*/Contents/Home/bin/java' -print -quit)"
    if [[ -n "$source_bundle" ]]; then
        source_bundle="$(dirname "$(dirname "$(dirname "$(dirname "$source_bundle")")")")"
    fi
    if [[ -z "$source_bundle" || ! -x "$source_bundle/Contents/Home/bin/java" ]]; then
        find "$download_dir" -depth -delete
        echo "Temurin JDK bundle is missing from the verified archive." >&2
        exit 1
    fi
    mkdir -p "$(dirname "$TEMURIN_BUNDLE")"
    local staged_bundle="${TEMURIN_BUNDLE}.new.$$"
    ditto "$source_bundle" "$staged_bundle"
    if [[ -e "$TEMURIN_BUNDLE" ]]; then
        find "$TEMURIN_BUNDLE" -depth -delete
    fi
    mv "$staged_bundle" "$TEMURIN_BUNDLE"
    find "$download_dir" -depth -delete
}

install_libreoffice() {
    if [[ -x "$LIBREOFFICE_APP/Contents/MacOS/soffice" ]]; then
        return
    fi
    local download_dir
    local mount_dir
    download_dir="$(mktemp -d /tmp/cwk-libreoffice.XXXXXX)"
    mount_dir="$download_dir/mount"
    mkdir -p "$mount_dir"
    download_verified "$LIBREOFFICE_URL" "$LIBREOFFICE_SHA256" "$download_dir/LibreOffice.dmg"
    hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$download_dir/LibreOffice.dmg" >/dev/null
    if [[ ! -d "$mount_dir/LibreOffice.app" ]]; then
        hdiutil detach "$mount_dir" >/dev/null || true
        echo "LibreOffice.app is missing from the verified disk image." >&2
        exit 1
    fi
    ditto "$mount_dir/LibreOffice.app" "$LIBREOFFICE_APP"
    hdiutil detach "$mount_dir" >/dev/null
    find "$download_dir" -depth -delete
}

install_h2orestart() {
    local download_dir
    download_dir="$(mktemp -d /tmp/cwk-h2orestart.XXXXXX)"
    download_verified "$H2ORESTART_URL" "$H2ORESTART_SHA256" "$download_dir/H2Orestart.oxt"
    install -m 644 "$download_dir/H2Orestart.oxt" "$H2ORESTART_TARGET"
    local staged_extension="${H2ORESTART_BUNDLED_DIR}.new.$$"
    mkdir -p "$staged_extension"
    /usr/bin/unzip -oq "$download_dir/H2Orestart.oxt" -d "$staged_extension"
    if [[ "$(sha256_file "$staged_extension/H2Orestart.jar")" != "$H2ORESTART_JAR_SHA256" ]] \
        || [[ ! -f "$staged_extension/META-INF/manifest.xml" ]] \
        || [[ ! -f "$staged_extension/package.components" ]]; then
        find "$staged_extension" -depth -delete
        find "$download_dir" -depth -delete
        echo "H2Orestart bundled extension is invalid." >&2
        exit 1
    fi
    if [[ -e "$H2ORESTART_BUNDLED_DIR" ]]; then
        find "$H2ORESTART_BUNDLED_DIR" -depth -delete
    fi
    mv "$staged_extension" "$H2ORESTART_BUNDLED_DIR"
    find "$download_dir" -depth -delete
}

verify_h2orestart() {
    if [[ ! -f "$H2ORESTART_TARGET" ]]; then
        echo "Missing HWP/HWPX extension: $H2ORESTART_TARGET" >&2
        return 1
    fi
    local actual_sha
    actual_sha="$(sha256_file "$H2ORESTART_TARGET")"
    if [[ "$actual_sha" != "$H2ORESTART_SHA256" ]]; then
        echo "H2Orestart checksum mismatch: $actual_sha" >&2
        return 1
    fi
    if [[ ! -f "$H2ORESTART_BUNDLED_DIR/H2Orestart.jar" ]] \
        || [[ "$(sha256_file "$H2ORESTART_BUNDLED_DIR/H2Orestart.jar")" != "$H2ORESTART_JAR_SHA256" ]]; then
        echo "LibreOffice bundled H2Orestart extension is missing or invalid." >&2
        return 1
    fi
}

if [[ "$MODE" == "install" ]]; then
    install_conda_tools
    install_temurin
    install_libreoffice
    mkdir -p "$TARGET_DIR"
    ln -sfn "$ENV_DIR/bin/qpdf" "$TARGET_DIR/qpdf"
    ln -sfn "$ENV_DIR/bin/pdfinfo" "$TARGET_DIR/pdfinfo"
    ln -sfn "$ENV_DIR/bin/pdftoppm" "$TARGET_DIR/pdftoppm"
    ln -sfn "$ENV_DIR/bin/pdftotext" "$TARGET_DIR/pdftotext"
    ln -sfn "$ENV_DIR/bin/tesseract" "$TARGET_DIR/tesseract"
    ln -sfn "$ENV_DIR/bin/gs" "$TARGET_DIR/gs"
    ln -sfn "$TEMURIN_BUNDLE/Contents/Home/bin/java" "$TARGET_DIR/java"
    ln -sfn "$LIBREOFFICE_APP/Contents/MacOS/soffice" "$TARGET_DIR/soffice"
    ln -sfn "$LIBREOFFICE_APP/Contents/MacOS/unopkg" "$TARGET_DIR/unopkg"
    ln -sfn /usr/bin/sips "$TARGET_DIR/sips"
    install_h2orestart
fi

for tool in "${TOOLS[@]}"; do
    if [[ ! -x "$TARGET_DIR/$tool" ]]; then
        echo "Missing required file tool: $TARGET_DIR/$tool" >&2
        exit 1
    fi
done
verify_h2orestart

if [[ ! -x "$TEMURIN_BUNDLE/Contents/Home/bin/java" ]]; then
    echo "Missing registered Temurin JDK bundle: $TEMURIN_BUNDLE" >&2
    exit 1
fi
if ! /usr/libexec/java_home -V 2>&1 | grep -Fq "$TEMURIN_BUNDLE/Contents/Home"; then
    echo "Temurin JDK is not registered with macOS java_home: $TEMURIN_BUNDLE" >&2
    exit 1
fi

languages="$(TESSDATA_PREFIX="$ENV_DIR/share/tessdata" "$TARGET_DIR/tesseract" --list-langs 2>/dev/null || true)"
for language in eng kor; do
    if ! grep -qx "$language" <<<"$languages"; then
        echo "Missing Tesseract language data: $language" >&2
        exit 1
    fi
done

java_version="$($TARGET_DIR/java -version 2>&1 | sed -n '1p')"
if [[ ! "$java_version" =~ \"21\. ]]; then
    echo "Expected Java 21, got: $java_version" >&2
    exit 1
fi

"$TARGET_DIR/qpdf" --version | sed -n '1p'
"$TARGET_DIR/pdftoppm" -v 2>&1 | sed -n '1p'
"$TARGET_DIR/pdfinfo" -v 2>&1 | sed -n '1p'
"$TARGET_DIR/pdftotext" -v 2>&1 | sed -n '1p'
TESSDATA_PREFIX="$ENV_DIR/share/tessdata" "$TARGET_DIR/tesseract" --version 2>&1 | sed -n '1p'
"$TARGET_DIR/gs" --version | sed -n '1p'
"$TARGET_DIR/soffice" --version | sed -n '1p'
"$TARGET_DIR/java" -version 2>&1 | sed -n '1p'
echo "Temurin ${TEMURIN_VERSION} (registered)"
echo "H2Orestart ${H2ORESTART_VERSION} (verified)"
echo "File tool runtimes are ready ($MODE)."
