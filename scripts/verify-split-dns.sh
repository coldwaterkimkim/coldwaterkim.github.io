#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DNSMASQ="${DNSMASQ_BIN:-$REPO_ROOT/.local-bin/dnsmasq}"
CONFIG="$REPO_ROOT/deploy/imac/dnsmasq-split-dns.conf"
PLIST="$REPO_ROOT/deploy/imac/com.coldwaterkim.split-dns.plist"
TEST_PORT="${SPLIT_DNS_TEST_PORT:-10553}"
TEST_ROOT="$(mktemp -d /tmp/cwk-split-dns-qa.XXXXXX)"
TEST_CONFIG="$TEST_ROOT/dnsmasq.conf"
DNSMASQ_PID=""

cleanup() {
  if [[ -n "$DNSMASQ_PID" ]]; then
    kill "$DNSMASQ_PID" 2>/dev/null || true
    wait "$DNSMASQ_PID" 2>/dev/null || true
  fi
  find "$TEST_ROOT" -depth -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEST_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

test -x "$DNSMASQ"
plutil -lint "$PLIST" >/dev/null
"$DNSMASQ" --test --conf-file="$CONFIG"

sed \
  -e "s/^port=53$/port=$TEST_PORT/" \
  -e 's/^listen-address=.*/listen-address=127.0.0.1/' \
  -e '/^user=/d' \
  -e '/^group=/d' \
  "$CONFIG" > "$TEST_CONFIG"

"$DNSMASQ" --keep-in-foreground --conf-file="$TEST_CONFIG" >"$TEST_ROOT/stdout.log" 2>"$TEST_ROOT/stderr.log" &
DNSMASQ_PID=$!
sleep 1
kill -0 "$DNSMASQ_PID"

test "$(dig @127.0.0.1 -p "$TEST_PORT" coldwaterkim.com A +short | tail -1)" = "192.168.0.11"
test "$(dig @127.0.0.1 -p "$TEST_PORT" www.coldwaterkim.com A +short | tail -1)" = "192.168.0.11"
test "$(dig @127.0.0.1 -p "$TEST_PORT" coldwaterkim.com A +tcp +short | tail -1)" = "192.168.0.11"

external_answer="$(dig @127.0.0.1 -p "$TEST_PORT" example.com A +short | tail -1)"
test -n "$external_answer"
test "$external_answer" != "192.168.0.11"

echo "Split DNS checks passed: local A records, TCP DNS, and upstream forwarding."
