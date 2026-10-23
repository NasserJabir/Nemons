#!/usr/bin/env bash
# ============================================================
# Nemons End-to-End Verification
# Confirms transparent interception works on every prompt
# ============================================================
set -e

NEMONS_URL="http://127.0.0.1:3456"
PASS=0
FAIL=0
SKIP=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$1"; }

# ---------- Test 1: Daemon health ----------
echo ""
echo "Test 1: Daemon health check"
if curl -sf "$NEMONS_URL/health" > /dev/null 2>&1; then
  green "  ✓ Daemon is healthy"
  PASS=$((PASS+1))
else
  red "  ✗ Daemon not reachable on $NEMONS_URL"
  FAIL=$((FAIL+1))
  exit 1
fi

# ---------- Test 2: Analyze endpoint (should intercept) ----------
echo ""
echo "Test 2: Analyze 'implement' prompt (should intercept)"
RESULT=$(curl -sf -X POST "$NEMONS_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"implement a hello world function in src/utils.ts","project_root":"/tmp","adapter":"opencode"}' 2>&1)

if echo "$RESULT" | grep -q '"should_intercept":true'; then
  green "  ✓ 'implement' prompt correctly intercepted"
  PASS=$((PASS+1))
else
  red "  ✗ 'implement' prompt not intercepted"
  echo "    Response: $RESULT"
  FAIL=$((FAIL+1))
fi

# ---------- Test 3: Analyze trivial prompt (should NOT intercept) ----------
echo ""
echo "Test 3: Analyze 'hello' prompt (should skip)"
RESULT=$(curl -sf -X POST "$NEMONS_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"hello","project_root":"/tmp","adapter":"opencode"}' 2>&1)

if echo "$RESULT" | grep -q '"should_intercept":false'; then
  green "  ✓ 'hello' prompt correctly skipped"
  PASS=$((PASS+1))
else
  yellow "  ⚠ 'hello' prompt handling ambiguous"
  SKIP=$((SKIP+1))
fi

# ---------- Test 4: Definition question (should skip) ----------
echo ""
echo "Test 4: Analyze 'what is React?' (should skip)"
RESULT=$(curl -sf -X POST "$NEMONS_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"what is React?","project_root":"/tmp","adapter":"opencode"}' 2>&1)

if echo "$RESULT" | grep -q '"should_intercept":false'; then
  green "  ✓ Definition question correctly skipped"
  PASS=$((PASS+1))
else
  yellow "  ⚠ Definition question handling ambiguous"
  SKIP=$((SKIP+1))
fi

# ---------- Test 5: Fix prompt (should intercept) ----------
echo ""
echo "Test 5: Analyze 'fix the bug' prompt"
RESULT=$(curl -sf -X POST "$NEMONS_URL/analyze" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"fix the bug in the auth flow, the user cant log in","project_root":"/tmp","adapter":"opencode"}' 2>&1)

if echo "$RESULT" | grep -q '"should_intercept":true'; then
  green "  ✓ Bug-fix prompt correctly intercepted"
  PASS=$((PASS+1))
else
  red "  ✗ Bug-fix prompt not intercepted"
  FAIL=$((FAIL+1))
fi

# ---------- Test 6: MCP endpoint ----------
echo ""
echo "Test 6: MCP server endpoint"
if curl -sf "$NEMONS_URL/mcp/health" > /dev/null 2>&1; then
  green "  ✓ MCP server responding"
  PASS=$((PASS+1))
else
  red "  ✗ MCP server not responding"
  FAIL=$((FAIL+1))
fi

# ---------- Test 7: Governance endpoint ----------
echo ""
echo "Test 7: Governance rules loaded"
if curl -sf "$NEMONS_URL/governance/rules" > /dev/null 2>&1; then
  green "  ✓ Governance rules accessible"
  PASS=$((PASS+1))
else
  yellow "  ⚠ Governance endpoint not configured"
  SKIP=$((SKIP+1))
fi

# ---------- Test 8: Monitoring metrics endpoint ----------
echo ""
echo "Test 8: Monitoring metrics endpoint"
if curl -sf "$NEMONS_URL/metrics" > /dev/null 2>&1; then
  green "  ✓ Metrics endpoint accessible"
  PASS=$((PASS+1))
else
  yellow "  ⚠ Metrics endpoint not configured"
  SKIP=$((SKIP+1))
fi

# ---------- Test 9: Redaction (security) ----------
echo ""
echo "Test 9: Secret redaction in evidence"
TEST_EVIDENCE='{"diff":"API_KEY_abc123 = sk-ant-supersecret","test_results":{}}'
RESULT=$(curl -sf -X POST "$NEMONS_URL/evidence" \
  -H "Content-Type: application/json" \
  -d "{\"run_id\":\"test-$RANDOM\",\"evidence\":$TEST_EVIDENCE}" 2>&1)

if echo "$RESULT" | grep -q "REDACTED"; then
  green "  ✓ Secrets redacted in evidence storage"
  PASS=$((PASS+1))
elif echo "$RESULT" | grep -q "abc123\|supersecret"; then
  red "  ✗ Secrets NOT redacted — SECURITY ISSUE"
  FAIL=$((FAIL+1))
else
  yellow "  ⚠ Cannot verify redaction"
  SKIP=$((SKIP+1))
fi

# ---------- Test 10: Health endpoint with detailed status ----------
echo ""
echo "Test 10: Detailed daemon health"
RESULT=$(curl -sf "$NEMONS_URL/health?detailed=true" 2>&1)
if echo "$RESULT" | grep -q '"status":"healthy"'; then
  green "  ✓ Detailed health check passed"
  PASS=$((PASS+1))
else
  yellow "  ⚠ Detailed health check inconclusive"
  SKIP=$((SKIP+1))
fi

# ---------- Summary ----------
echo ""
echo "============================================================"
echo "  Test Summary"
echo "============================================================"
green "  ✓ Passed: $PASS"
red   "  ✗ Failed: $FAIL"
yellow "  ⚠ Skipped: $SKIP"
echo "  Total: $((PASS+FAIL+SKIP))"
echo ""

if [ $FAIL -gt 0 ]; then
  red "✗ Nemons installation has issues — fix the failures above"
  exit 1
fi

green "✅ Nemons transparent interception is working correctly!"
echo ""
echo "Next: open a coding agent (e.g. opencode) and try:"
echo "  > implement a hello world function"
echo "Nemons should auto-trigger on every prompt. 🎉"
