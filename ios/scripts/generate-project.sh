#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=2.46.0
checksum=4d9e34b62172d645eed6457cac13fc222569974098ef4ee9c3368bedf0196806
mkdir -p .tools
if [[ ! -x .tools/xcodegen/bin/xcodegen ]]; then
  curl --fail --location --retry 3 "https://github.com/yonaskolb/XcodeGen/releases/download/$version/xcodegen.zip" -o .tools/xcodegen.zip
  echo "$checksum  .tools/xcodegen.zip" | shasum -a 256 -c -
  unzip -oq .tools/xcodegen.zip -d .tools
fi
.tools/xcodegen/bin/xcodegen generate --spec project.yml
