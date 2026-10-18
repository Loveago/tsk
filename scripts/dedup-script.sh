#!/bin/bash
# ============================================================
# reassign-lofaq-dupes.sh
#
# Finds LOFAQ DATA HUB storefront orders where the same
# phoneNumber + gbAmount was already ordered by another user
# account on the same day, and reassigns them to DATA-DEALS.
#
# Usage:
#   ./reassign-lofaq-dupes.sh              # checks today
#   ./reassign-lofaq-dupes.sh 2026-10-18   # checks a specific date
# ============================================================

set -euo pipefail

# ── IDs ──────────────────────────────────────────────────────
LOFAQ_STOREFRONT_ID="cmuy2tw1i000z6x75iltlg5ls"
LOFAQ_USER_ID="cmu6zaqg100036xwatsgacshq"
DATA_DEALS_STOREFRONT_ID="cmutqe3qb00046x02cdb00h9m"
DATA_DEALS_USER_ID="cmu643z4000006xtc3knshme9"

# ── Load DATABASE_URL ────────────────────────────────────────
export $(grep DATABASE_URL /var/www/tskconnect/.env | xargs)
DB_URL="${DATABASE_URL%%\?*}"

# ── Date to check (default: today UTC) ──────────────────────
CHECK_DATE="${1:-$(date -u +%Y-%m-%d)}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  LOFAQ → DATA-DEALS  Duplicate Reassignment"
echo "  Date: $CHECK_DATE"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Show duplicates ─────────────────────────────────
echo "🔍 Scanning for LOFAQ orders that duplicate another user's order..."
echo ""

DUPES=$(psql "$DB_URL" -t -A -F'|' -c "
SELECT
  o.id,
  o.\"phoneNumber\",
  o.network,
  o.\"gbAmount\",
  o.amount,
  o.status,
  so.\"paymentReference\",
  o2.id AS dup_order_id,
  u2.name AS dup_user
FROM \"Order\" o
JOIN \"StorefrontOrder\" so ON so.\"underlyingOrderId\" = o.id
JOIN \"Order\" o2 ON o2.\"phoneNumber\" = o.\"phoneNumber\"
                  AND o2.\"gbAmount\" = o.\"gbAmount\"
                  AND o2.\"createdAt\"::date = o.\"createdAt\"::date
                  AND o2.\"userId\" != '$LOFAQ_USER_ID'
                  AND o2.id != o.id
JOIN \"User\" u2 ON o2.\"userId\" = u2.id
WHERE so.\"storefrontId\" = '$LOFAQ_STOREFRONT_ID'
  AND o.\"createdAt\"::date = '$CHECK_DATE'
  AND o.\"userId\" = '$LOFAQ_USER_ID'
ORDER BY o.id;
")

if [ -z "$DUPES" ]; then
  echo "✅ No duplicate LOFAQ orders found for $CHECK_DATE."
  exit 0
fi

# Display as a table
echo "  LOFAQ Order  | Phone       | Net | GB | GHS   | Status   | Reference          | Dup Order | Dup User"
echo "  -------------|-------------|-----|----|-------|----------|--------------------|-----------|----------"
while IFS='|' read -r oid phone net gb amt status ref dup_oid dup_user; do
  printf "  %-12s | %-11s | %-3s | %-2s | %-5s | %-8s | %-18s | %-9s | %s\n" \
    "TSK-$((oid + 10000))" "$phone" "$net" "$gb" "$amt" "$status" "$ref" "TSK-$((dup_oid + 10000))" "$dup_user"
done <<< "$DUPES"

# Count unique LOFAQ order IDs
COUNT=$(echo "$DUPES" | cut -d'|' -f1 | sort -u | wc -l | tr -d ' ')
echo ""
echo "  Found $COUNT LOFAQ order(s) to reassign → DATA-DEALS"
echo ""

# ── Step 2: Confirm ─────────────────────────────────────────
read -p "  Reassign these orders to DATA-DEALS? (y/n): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "  ❌ Aborted."
  exit 0
fi

# ── Step 3: Reassign ────────────────────────────────────────
echo ""
echo "  ⏳ Reassigning..."

psql "$DB_URL" -c "
BEGIN;

-- Collect the duplicate LOFAQ order IDs
CREATE TEMP TABLE _lofaq_dupes AS
SELECT DISTINCT o.id
FROM \"Order\" o
JOIN \"StorefrontOrder\" so ON so.\"underlyingOrderId\" = o.id
WHERE so.\"storefrontId\" = '$LOFAQ_STOREFRONT_ID'
  AND o.\"createdAt\"::date = '$CHECK_DATE'
  AND o.\"userId\" = '$LOFAQ_USER_ID'
  AND EXISTS (
    SELECT 1 FROM \"Order\" o2
    WHERE o2.\"phoneNumber\" = o.\"phoneNumber\"
      AND o2.\"gbAmount\" = o.\"gbAmount\"
      AND o2.\"createdAt\"::date = o.\"createdAt\"::date
      AND o2.\"userId\" != '$LOFAQ_USER_ID'
      AND o2.id != o.id
  );

-- Reassign Order owner
UPDATE \"Order\"
SET \"userId\" = '$DATA_DEALS_USER_ID'
WHERE id IN (SELECT id FROM _lofaq_dupes);

-- Reassign StorefrontOrder storefront
UPDATE \"StorefrontOrder\"
SET \"storefrontId\" = '$DATA_DEALS_STOREFRONT_ID'
WHERE \"underlyingOrderId\" IN (SELECT id FROM _lofaq_dupes);

DROP TABLE _lofaq_dupes;

COMMIT;
"

echo ""
echo "  ✅ Done! $COUNT order(s) reassigned from LOFAQ DATA HUB → DATA-DEALS."
echo ""
