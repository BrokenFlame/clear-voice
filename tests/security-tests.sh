#!/bin/bash
# Dynamic Security Tests for ClearVoice API - Simplified

API_URL="${1:-http://localhost:5000}"
echo "🔒 ClearVoice Dynamic Security Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Target: $API_URL"
echo ""

# Test 1: Unauthenticated access
echo "1️⃣  Test: Unauthenticated access to /api/merchant/files"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/merchant/files")
[ "$HTTP_CODE" = "401" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ❌ FAIL (HTTP $HTTP_CODE)"

# Test 2: Invalid JWT token
echo "2️⃣  Test: Invalid JWT token"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/merchant/files" \
  -H "Authorization: Bearer invalid.token.here")
[ "$HTTP_CODE" = "401" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ❌ FAIL (HTTP $HTTP_CODE)"

# Test 3: Health endpoint (should be unauthenticated)
echo "3️⃣  Test: /health endpoint accessibility"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/health")
[ "$HTTP_CODE" = "200" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ⚠️  Got HTTP $HTTP_CODE"

# Test 4: Non-existent endpoint
echo "4️⃣  Test: Non-existent endpoint returns 404"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/nonexistent" \
  -H "Authorization: Bearer test")
[ "$HTTP_CODE" = "404" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ⚠️  Got HTTP $HTTP_CODE"

# Test 5: Invalid content-type on POST
echo "5️⃣  Test: Invalid content-type on POST"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/merchant/files/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"test":"data"}')
[ "$HTTP_CODE" != "200" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ⚠️  WARNING (HTTP $HTTP_CODE)"

# Test 6: DELETE without auth
echo "6️⃣  Test: DELETE without proper auth"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/merchant/files/123")
[ "$HTTP_CODE" != "200" ] && echo "   ✅ PASS (HTTP $HTTP_CODE)" || echo "   ⚠️  WARNING (HTTP $HTTP_CODE)"

# Test 7: Check Swagger endpoint
echo "7️⃣  Test: Swagger/OpenAPI endpoint"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/swagger/v1/swagger.json")
[ "$HTTP_CODE" = "200" ] && echo "   ℹ️  Swagger enabled (HTTP $HTTP_CODE) - verify in production" || echo "   ✅ PASS (HTTP $HTTP_CODE)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Dynamic security tests complete"
echo ""
