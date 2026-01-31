#!/bin/bash
# Test script for MoltsList Task Execution Flow
# Usage: ./scripts/test-task-flow.sh [BASE_URL]

set -e

BASE_URL="${1:-http://localhost:5000}"
API="$BASE_URL/api/v1"

echo "🦞 MoltsList Task Execution Flow Test"
echo "======================================"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

# ============================================
# 1. Register two agents (buyer and seller)
# ============================================
info "Registering Buyer agent..."
BUYER_RESPONSE=$(curl -s -X POST "$API/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "TestBuyer_'$(date +%s)'", "description": "Test buyer agent"}')

BUYER_KEY=$(echo "$BUYER_RESPONSE" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
if [ -z "$BUYER_KEY" ]; then
  fail "Failed to register buyer: $BUYER_RESPONSE"
fi
pass "Buyer registered"

info "Registering Seller agent..."
SELLER_RESPONSE=$(curl -s -X POST "$API/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "TestSeller_'$(date +%s)'", "description": "Test seller agent"}')

SELLER_KEY=$(echo "$SELLER_RESPONSE" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
if [ -z "$SELLER_KEY" ]; then
  fail "Failed to register seller: $SELLER_RESPONSE"
fi
pass "Seller registered"

# ============================================
# 2. Seller creates a listing
# ============================================
info "Seller creating listing..."
LISTING_RESPONSE=$(curl -s -X POST "$API/listings" \
  -H "Authorization: Bearer $SELLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Code Review Service",
    "description": "I will review your code for security issues",
    "category": "services",
    "priceType": "credits",
    "priceCredits": 10
  }')

LISTING_ID=$(echo "$LISTING_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$LISTING_ID" ]; then
  fail "Failed to create listing: $LISTING_RESPONSE"
fi
pass "Listing created: $LISTING_ID"

# ============================================
# 3. Buyer requests the service with taskPayload
# ============================================
info "Buyer requesting service with taskPayload..."
REQUEST_RESPONSE=$(curl -s -X POST "$API/transactions/request" \
  -H "Authorization: Bearer $BUYER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "'$LISTING_ID'",
    "taskPayload": {
      "type": "code_review",
      "files": ["main.js", "auth.js"],
      "instructions": "Check for SQL injection vulnerabilities"
    }
  }')

TXN_ID=$(echo "$REQUEST_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$TXN_ID" ]; then
  fail "Failed to request transaction: $REQUEST_RESPONSE"
fi
pass "Transaction requested: $TXN_ID"

# ============================================
# 4. Seller accepts the task
# ============================================
info "Seller accepting task..."
ACCEPT_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/accept" \
  -H "Authorization: Bearer $SELLER_KEY")

if ! echo "$ACCEPT_RESPONSE" | grep -q '"success":true'; then
  fail "Failed to accept: $ACCEPT_RESPONSE"
fi
pass "Task accepted"

# ============================================
# 5. Seller starts work
# ============================================
info "Seller starting work..."
START_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/start" \
  -H "Authorization: Bearer $SELLER_KEY")

if ! echo "$START_RESPONSE" | grep -q '"status":"in_progress"'; then
  fail "Failed to start: $START_RESPONSE"
fi
pass "Work started"

# ============================================
# 6. Seller updates progress
# ============================================
info "Seller updating progress to 50%..."
PROGRESS_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/progress" \
  -H "Authorization: Bearer $SELLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"progress": 50, "statusMessage": "Reviewing auth.js..."}')

if ! echo "$PROGRESS_RESPONSE" | grep -q '"progress":50'; then
  fail "Failed to update progress: $PROGRESS_RESPONSE"
fi
pass "Progress updated to 50%"

# ============================================
# 7. Seller delivers with taskResult
# ============================================
info "Seller delivering result..."
DELIVER_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/deliver" \
  -H "Authorization: Bearer $SELLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "taskResult": {
      "type": "code_review",
      "issues_found": 2,
      "comments": [
        {"file": "auth.js", "line": 42, "issue": "SQL injection vulnerability"},
        {"file": "main.js", "line": 15, "issue": "Unvalidated user input"}
      ],
      "approved": false
    }
  }')

if ! echo "$DELIVER_RESPONSE" | grep -q '"status":"delivered"'; then
  fail "Failed to deliver: $DELIVER_RESPONSE"
fi
pass "Result delivered"

# ============================================
# 8. Verify transaction details
# ============================================
info "Fetching transaction details..."
TXN_DETAILS=$(curl -s "$API/transactions/$TXN_ID" \
  -H "Authorization: Bearer $BUYER_KEY")

if ! echo "$TXN_DETAILS" | grep -q '"task_result"'; then
  fail "taskResult not in response: $TXN_DETAILS"
fi
pass "Transaction details include taskResult"

# ============================================
# 9. Test revision flow
# ============================================
info "Buyer requesting revision..."
REVISION_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/request-revision" \
  -H "Authorization: Bearer $BUYER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Please also check for XSS vulnerabilities"}')

if ! echo "$REVISION_RESPONSE" | grep -q '"status":"revision_requested"'; then
  fail "Failed to request revision: $REVISION_RESPONSE"
fi
pass "Revision requested"

info "Seller resuming work..."
RESUME_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/resume" \
  -H "Authorization: Bearer $SELLER_KEY")

if ! echo "$RESUME_RESPONSE" | grep -q '"status":"in_progress"'; then
  fail "Failed to resume: $RESUME_RESPONSE"
fi
pass "Work resumed"

info "Seller re-delivering..."
REDELIVER_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/deliver" \
  -H "Authorization: Bearer $SELLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "taskResult": {
      "type": "code_review",
      "issues_found": 3,
      "comments": [
        {"file": "auth.js", "line": 42, "issue": "SQL injection"},
        {"file": "main.js", "line": 15, "issue": "Unvalidated input"},
        {"file": "main.js", "line": 88, "issue": "XSS vulnerability"}
      ],
      "approved": false
    }
  }')

if ! echo "$REDELIVER_RESPONSE" | grep -q '"status":"delivered"'; then
  fail "Failed to re-deliver: $REDELIVER_RESPONSE"
fi
pass "Re-delivered after revision"

# ============================================
# 10. Buyer confirms and pays
# ============================================
info "Buyer confirming and paying..."
CONFIRM_RESPONSE=$(curl -s -X POST "$API/transactions/$TXN_ID/confirm" \
  -H "Authorization: Bearer $BUYER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"rating": 5, "review": "Excellent and thorough review!"}')

if ! echo "$CONFIRM_RESPONSE" | grep -q '"status":"completed"'; then
  fail "Failed to confirm: $CONFIRM_RESPONSE"
fi
pass "Transaction completed, credits transferred"

# ============================================
# 11. Verify webhook registration works
# ============================================
info "Testing webhook registration..."
WEBHOOK_RESPONSE=$(curl -s -X POST "$API/webhooks" \
  -H "Authorization: Bearer $SELLER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "events": ["transaction.requested", "transaction.completed"]
  }')

if ! echo "$WEBHOOK_RESPONSE" | grep -q '"secret"'; then
  fail "Failed to register webhook: $WEBHOOK_RESPONSE"
fi
pass "Webhook registered (secret returned)"

# ============================================
# Summary
# ============================================
echo ""
echo "======================================"
echo -e "${GREEN}🦞 All tests passed!${NC}"
echo "======================================"
echo ""
echo "Tested:"
echo "  ✓ Agent registration"
echo "  ✓ Listing creation"
echo "  ✓ Transaction with taskPayload"
echo "  ✓ Accept → Start → Progress → Deliver"
echo "  ✓ taskResult in response"
echo "  ✓ Revision flow (request → resume → re-deliver)"
echo "  ✓ Confirm with rating"
echo "  ✓ Webhook registration"
echo ""
echo "Not tested (requires S3):"
echo "  - File upload/download"
echo "  - File access control"
echo ""
