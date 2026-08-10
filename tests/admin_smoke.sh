#!/usr/bin/env bash
set -euo pipefail

URL=${URL:-http://localhost:3000}
CJ=tests/cookiejar
mkdir -p tests
rm -f "$CJ"

echo "[smoke] Using base URL: $URL"

echo "[smoke] Register initial admin (may fail if already exists)..."
REG=$(curl -s -X POST "$URL/api/register" -H 'Content-Type: application/json' -d '{"email":"admin@local","password":"password"}' -c "$CJ" 2>/dev/null || true)
echo "[smoke] register -> $REG"

echo "[smoke] Login as admin..."
LOGIN=$(curl -s -X POST "$URL/api/login" -H 'Content-Type: application/json' -d '{"email":"admin@local","password":"password"}' -c "$CJ" -b "$CJ" 2>/dev/null || true)
echo "[smoke] login -> $LOGIN"
if ! echo "$LOGIN" | grep -q '"ok":true'; then
  echo "[smoke] login failed; ensure the server is running and credentials are correct" >&2
  exit 2
fi

echo "[smoke] List users..."
curl -s -X GET "$URL/api/users" -b "$CJ" | sed -n '1,200p'

echo "[smoke] Create test user..."
# Remove any existing test user to keep the test idempotent
EXISTING_ID=$(curl -s -X GET "$URL/api/users" -b "$CJ" | python3 -c "import sys,json; j=json.load(sys.stdin); print(next((str(u['id']) for u in j.get('users',[]) if u.get('email')=='testuser@example.com'),''))" || true)
if [ -n "$EXISTING_ID" ]; then
  echo "[smoke] found existing test user id $EXISTING_ID, deleting..."
  curl -s -X DELETE "$URL/api/users/$EXISTING_ID" -b "$CJ" >/dev/null || true
fi

CR=$(curl -s -X POST "$URL/api/register" -H 'Content-Type: application/json' -d '{"email":"testuser@example.com","password":"pass","role":"EDITOR","displayName":"Test User"}' -b "$CJ" 2>/dev/null || true)
echo "[smoke] create -> $CR"
if ! echo "$CR" | grep -q '"ok":true'; then
  echo "[smoke] create user failed" >&2
  exit 3
fi

# extract id
NEWUID=$(echo "$CR" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
echo "[smoke] created user id: $NEWUID"

echo "[smoke] Deleting test user id $NEWUID..."
DEL=$(curl -s -X DELETE "$URL/api/users/$NEWUID" -b "$CJ" 2>/dev/null || true)
echo "[smoke] delete -> $DEL"

echo "[smoke] Done."

exit 0
