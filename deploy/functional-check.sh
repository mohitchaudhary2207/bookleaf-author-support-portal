#!/usr/bin/env bash
# Post-deployment functional check, run ON THE SERVER against the public HTTPS URL so the seeded passwords never leave it.
#   ssh ... 'bash -s' < functional-check.sh
# Creates a few clearly labelled test tickets in the production database (expected). Makes ~2 OpenAI calls.
set -u
BASE=https://bookleaf.206.189.178.199.nip.io
set -a; . /opt/bookleaf/.env; set +a
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1  ${2:-}"; fail=$((fail+1)); }
# usage: code [curl args...] <output-file>   -> prints HTTP status
code() { local out="${*: -1}"; local args=("${@:1:$#-1}"); curl -s -o "$out" -w "%{http_code}" --max-time 30 "${args[@]}" 2>/dev/null; }
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

login() { curl -s --max-time 20 -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"; }

A=$(login priya.sharma@email.com "$SEED_AUTHOR_PASSWORD"); AT=$(echo "$A" | jget "['token']")
[ -n "$AT" ] && ok "author login" || bad "author login" "$(echo "$A" | head -c 120)"
R=$(login rohit.kapoor@email.com "$SEED_AUTHOR_PASSWORD"); RT=$(echo "$R" | jget "['token']")
[ -n "$RT" ] && ok "second author login" || bad "second author login"
D=$(login admin@bookleaf.com "$SEED_ADMIN_PASSWORD"); DT=$(echo "$D" | jget "['token']")
[ -n "$DT" ] && ok "admin login" || bad "admin login"
W=$(login priya.sharma@email.com "wrong-password-check"); echo "$W" | grep -q '"token"' && bad "wrong password accepted" || ok "wrong password rejected"

[ "$(code -H "Authorization: Bearer $AT" "$BASE/api/v1/admin/tickets" /dev/null)" = 403 ] && ok "author blocked from admin API (403)" || bad "author admin RBAC"
[ "$(code -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/tickets" /dev/null)" = 200 ] && ok "admin reads queue (200)" || bad "admin queue"

# Create a ticket with an attachment (multipart), as the author.
echo "deployment test attachment" > /tmp/bl-test.txt
C=$(curl -s --max-time 40 -X POST "$BASE/api/v1/tickets" -H "Authorization: Bearer $AT" -F bookId=BK001 \
  -F "subject=[Deployment test] royalty question" -F "description=Deployment verification ticket - please ignore. Where is my royalty payment for this quarter?" -F "attachments=@/tmp/bl-test.txt;type=text/plain")
TID=$(echo "$C" | jget "['id']"); [ -n "$TID" ] && ok "author creates ticket with attachment (id $TID)" || bad "create ticket" "$(echo "$C" | head -c 160)"

# AI triage runs after the response: wait for category + priority.
for i in $(seq 1 30); do
  DET=$(curl -s --max-time 20 -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/tickets/$TID")
  CAT=$(echo "$DET" | jget "['ticket']['category']"); [ "$CAT" != "None" ] && [ -n "$CAT" ] && break; sleep 2
done
SRC=$(echo "$DET" | jget "['ticket']['categorySource']"); PRI=$(echo "$DET" | jget "['ticket']['priority']")
[ "$SRC" = "ai" ] && ok "AI classification set category '$CAT' / priority '$PRI'" || bad "AI triage" "source=$SRC category=$CAT"

# Cross-author isolation: a different author must get 404 for this ticket.
[ "$(code -H "Authorization: Bearer $RT" "$BASE/api/v1/tickets/$TID" /dev/null)" = 404 ] && ok "other author gets 404 for this ticket" || bad "cross-author isolation"

# Explicit draft behaviour: opening (GET) must not generate; POST must generate exactly once.
usage_drafts() { curl -s --max-time 20 -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/ai/usage" | python3 -c "import sys,json; print(sum(p['calls'] for p in json.load(sys.stdin)['byPurpose'] if p['purpose']=='draft'))"; }
B0=$(usage_drafts)
G1=$(code -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/tickets/$TID/draft" /dev/null)
G2=$(code -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/tickets/$TID/draft" /dev/null)
B1=$(usage_drafts)
[ "$G1$G2" = "204204" ] && [ "$B0" = "$B1" ] && ok "opening ticket (GET draft x2) generates nothing (204, no draft calls)" || bad "GET draft generated" "codes=$G1,$G2 draftCalls $B0->$B1"
P=$(curl -s --max-time 90 -X POST -H "Authorization: Bearer $DT" "$BASE/api/v1/admin/tickets/$TID/draft")
PSRC=$(echo "$P" | jget "['source']"); B2=$(usage_drafts)
[ "$PSRC" = "ai" ] && [ "$B2" = "$((B1+1))" ] && ok "Generate AI Response (POST) makes exactly one AI draft" || bad "explicit generate" "source=$PSRC calls $B1->$B2 $(echo "$P" | head -c 120)"

# Live updates: listen on the SSE stream while the admin replies.
curl -s -N --max-time 25 -H "Authorization: Bearer $AT" "$BASE/api/v1/events" > /tmp/bl-sse.txt &
SSE=$!; sleep 3
REPLY=$(curl -s --max-time 30 -X POST "$BASE/api/v1/admin/tickets/$TID/messages" -H "Authorization: Bearer $DT" -H 'Content-Type: application/json' \
  -d "{\"body\":\"Hi Priya, deployment verification reply. Thank you for your patience.\n\nWarm regards,\nRiya Mehta\nBookLeaf Support\"}")
echo "$REPLY" | grep -q '"id"' && ok "admin sends reply" || bad "admin reply" "$(echo "$REPLY" | head -c 120)"
wait $SSE 2>/dev/null
grep -q "event:" /tmp/bl-sse.txt && ok "SSE update received by author stream" || bad "SSE update" "no events in stream"

# Author sees the reply; admin notes stay private.
AD=$(curl -s --max-time 20 -H "Authorization: Bearer $AT" "$BASE/api/v1/tickets/$TID")
echo "$AD" | grep -q "deployment verification reply" && ok "author sees admin reply" || bad "author reply visibility"
echo "$AD" | grep -q '"notes"' && bad "author payload exposes notes" || ok "author payload has no internal notes"

# Attachment download (authorised) works.
ATT=$(echo "$AD" | jget "['attachments'][0]['id']")
[ -n "$ATT" ] && [ "$(code -H "Authorization: Bearer $AT" "$BASE/api/v1/tickets/$TID/attachments/$ATT" /dev/null)" = 200 ] && ok "attachment downloads for owner" || bad "attachment download"

rm -f /tmp/bl-test.txt /tmp/bl-sse.txt
echo "----"; echo "$pass passed, $fail failed"
echo "TICKET_ID=$TID"
