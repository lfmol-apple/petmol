#!/bin/bash
set -euo pipefail

SITE_URL="${1:-https://petmol.com.br}"
EXPECTED_BUILD_ID="${2:-$(git rev-parse --short HEAD)}"

tmp_html="$(mktemp)"
tmp_sw="$(mktemp)"
cleanup() {
  rm -f "$tmp_html" "$tmp_sw"
}
trap cleanup EXIT

echo "[verify-sync] site=$SITE_URL expected_build=$EXPECTED_BUILD_ID"

curl -fsSL "$SITE_URL/login" -o "$tmp_html"

if grep -q "build $EXPECTED_BUILD_ID" "$tmp_html" && grep -q "data-build-id=\"$EXPECTED_BUILD_ID\"" "$tmp_html"; then
  echo "[verify-sync] build marker OK"
else
  echo "[verify-sync] build marker mismatch"
  exit 1
fi

api_code="$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/api/health")"
if [ "$api_code" = "200" ]; then
  echo "[verify-sync] api health OK"
else
  echo "[verify-sync] api health failed http=$api_code"
  exit 1
fi

curl -fsSL "$SITE_URL/sw.js" -o "$tmp_sw"
if grep -q "build-id: $EXPECTED_BUILD_ID" "$tmp_sw"; then
  echo "[verify-sync] sw.js build OK"
else
  echo "[verify-sync] sw.js build mismatch"
  exit 1
fi

echo "[verify-sync] sync validation OK"