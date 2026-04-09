#!/bin/bash
# PETMOL Apply Script - Runs on VPS
# Called by publish.sh via SSH
set -e

# ============================================
# Configuration
# ============================================
REMOTE_DIR="/opt/petmol"
APP_DIR="$REMOTE_DIR/app"
ZIP_PATH="$REMOTE_DIR/PETMOL.zip"
TEMP_DIR="$REMOTE_DIR/PETMOL_new"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[VPS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[FAIL]${NC} $1"; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }

log "============================================"
log "Applying PETMOL update on VPS"
log "============================================"

# ============================================
# Step 1: Unzip to temp directory
# ============================================
log "Extracting package..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
unzip -q -o "$ZIP_PATH" -d "$TEMP_DIR"

# ============================================
# Step 2: Detect what changed
# ============================================
RESTART_API=false
RESTART_WEB=false

if [ -d "$APP_DIR" ]; then
    # Check if backend changed
    if ! diff -rq "$TEMP_DIR/services" "$APP_DIR/services" > /dev/null 2>&1; then
        RESTART_API=true
        log "Backend changes detected"
    fi

    # Check if frontend changed (excluding .next)
    if ! diff -rq "$TEMP_DIR/apps/web/src" "$APP_DIR/apps/web/src" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend changes detected"
    fi
    if ! diff -q "$TEMP_DIR/apps/web/package.json" "$APP_DIR/apps/web/package.json" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend package.json changed"
    fi
    if ! diff -rq "$TEMP_DIR/apps/web/public" "$APP_DIR/apps/web/public" > /dev/null 2>&1; then
        RESTART_WEB=true
        log "Frontend public/ changed"
    fi
else
    RESTART_API=true
    RESTART_WEB=true
    log "Fresh install - will start all services"
fi

# ============================================
# Step 3: Rsync to app directory (preserve .env files and secrets)
# ============================================
log "Syncing files..."
rsync -a --delete \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.secrets' \
    --exclude '.venv' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude 'services/price-service/uploads' \
    "$TEMP_DIR/" "$APP_DIR/"

# Fix permissions
chown -R petmol:petmol "$APP_DIR" 2>/dev/null || true

# ============================================
# Step 4: Install dependencies if needed
# ============================================
if [ "$RESTART_API" = true ]; then
    log "Installing Python dependencies..."
    cd "$APP_DIR/services/price-service"
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    .venv/bin/pip install -q --upgrade pip
    .venv/bin/pip install -q -e .
    .venv/bin/pip install -q uvicorn[standard]
fi

if [ "$RESTART_WEB" = true ]; then
    log "Installing npm dependencies..."
    cd "$APP_DIR"
    export NEXT_IGNORE_INCORRECT_LOCKFILE=1
    npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps

    log "Building Next.js..."
    npm run web:build

    # ── Copy static assets into standalone build ──────────────────────────
    # Next.js standalone mode requires public/ and .next/static/ to be
    # manually copied next to the server.js entry point.
    log "Copying static assets to standalone..."
    STANDALONE="$APP_DIR/apps/web/.next/standalone/apps/web"
    cp -r "$APP_DIR/apps/web/public"       "$STANDALONE/"
    cp -r "$APP_DIR/apps/web/.next/static" "$STANDALONE/.next/"
    # ──────────────────────────────────────────────────────────────────────
fi

# Fix permissions again after install
chown -R petmol:petmol "$APP_DIR" 2>/dev/null || true

# ============================================
# Step 5: Restart services
# ============================================
if [ "$RESTART_API" = true ]; then
    log "Restarting petmol-api..."
    systemctl restart petmol-api
fi

if [ "$RESTART_WEB" = true ]; then
    log "Restarting petmol-web..."
    systemctl restart petmol-web
fi

# Wait for services to start
sleep 5

# ============================================
# Step 6: Health checks
# ============================================
log "Running health checks..."
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: API health
if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    pass "API health: OK"
    ((++TESTS_PASSED))
else
    error "API health: FAILED"
    ((++TESTS_FAILED))
fi

# Test 2: API version
API_VERSION=$(curl -s "http://127.0.0.1:8000/version" 2>/dev/null)
if echo "$API_VERSION" | grep -q "service"; then
    pass "API /version: OK — $API_VERSION"
    ((++TESTS_PASSED))
else
    error "API /version: failed"
    ((++TESTS_FAILED))
fi

# Test 3: Suggest endpoint
SUGGEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/suggest?q=racao&country=BR&limit=3")
if [ "$SUGGEST_RESPONSE" = "200" ]; then
    pass "/suggest: 200 OK"
    ((++TESTS_PASSED))
else
    error "/suggest: HTTP $SUGGEST_RESPONSE (expected 200)"
    ((++TESTS_FAILED))
fi

# Test 4: Frontend home
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/")
if [ "$FRONTEND_RESPONSE" = "200" ] || [ "$FRONTEND_RESPONSE" = "307" ] || [ "$FRONTEND_RESPONSE" = "308" ]; then
    pass "Frontend: HTTP $FRONTEND_RESPONSE OK"
    ((++TESTS_PASSED))
else
    error "Frontend: HTTP $FRONTEND_RESPONSE"
    ((++TESTS_FAILED))
fi

# Test 5: sw.js (critical for push notifications)
SW_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/sw.js")
if [ "$SW_RESPONSE" = "200" ]; then
    pass "sw.js: 200 OK"
    ((++TESTS_PASSED))
else
    error "sw.js: HTTP $SW_RESPONSE (push notifications will not work)"
    ((++TESTS_FAILED))
fi

# Test 6: VAPID public key endpoint
VAPID_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/notifications/vapid-public-key")
if [ "$VAPID_RESPONSE" = "200" ]; then
    pass "VAPID key endpoint: 200 OK"
    ((++TESTS_PASSED))
else
    error "VAPID key endpoint: HTTP $VAPID_RESPONSE"
    ((++TESTS_FAILED))
fi

# ============================================
# Step 7: Summary
# ============================================
echo ""
log "============================================"
if [ "$TESTS_FAILED" = "0" ]; then
    log "✅ ALL $TESTS_PASSED TESTS PASSED — deploy successful!"
else
    error "⚠ $TESTS_FAILED/$((TESTS_PASSED + TESTS_FAILED)) tests failed"
    log "Passed: $TESTS_PASSED | Failed: $TESTS_FAILED"
fi
log "============================================"

# Cleanup
rm -rf "$TEMP_DIR"
rm -f "$ZIP_PATH"
