#!/usr/bin/env bash
set -euo pipefail

: "${CLAIRE_API_URL:?Set CLAIRE_API_URL to the deployed Claire API origin}"
: "${SUPABASE_URL:?Set SUPABASE_URL to the deployed Supabase API origin}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY to the public anon key}"

api_origin="${CLAIRE_API_URL%/}"
supabase_origin="${SUPABASE_URL%/}"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

health_status="$(curl --silent --show-error --output "$temporary_directory/health.json" --write-out '%{http_code}' --max-time 15 "$api_origin/health")"
if [[ "$health_status" != "200" ]]; then
  echo "FAIL API health returned HTTP $health_status"
  exit 1
fi
echo "PASS API health"

route_status="$(curl --silent --show-error --output "$temporary_directory/route.json" --write-out '%{http_code}' --max-time 15 --request PUT "$api_origin/notification-devices" --header 'Content-Type: application/json' --data '{}')"
if [[ "$route_status" != "401" ]]; then
  echo "FAIL notification registration route returned HTTP $route_status; expected 401 without authentication"
  exit 1
fi
echo "PASS notification registration route is deployed"

for table_name in notification_devices notification_deliveries; do
  table_status="$(curl --silent --show-error --output "$temporary_directory/$table_name.json" --write-out '%{http_code}' --max-time 15 "$supabase_origin/rest/v1/$table_name?select=id&limit=1" --header "apikey: $SUPABASE_ANON_KEY")"
  if [[ "$table_status" != "200" ]]; then
    echo "FAIL PostgREST table $table_name returned HTTP $table_status"
    exit 1
  fi
  echo "PASS PostgREST exposes $table_name"
done

echo "READY deployment prerequisites are visible; continue with physical-device registration and provider acceptance"
