#!/bin/sh
set -eu
umask 077
for key in MATRIX_SERVER_NAME MATRIX_HOMESERVER_URL IG_AS_TOKEN IG_HS_TOKEN IG_PROVISIONING_SECRET; do
  eval "value=\${$key:-}"
  if [ -z "$value" ]; then echo "Missing $key" >&2; exit 1; fi
done
mkdir -p /data
cp /config.template.yaml /data/config.yaml
replace() { sed -i "s|$1|$2|g" /data/config.yaml; }
replace '__MATRIX_SERVER_NAME__' "$MATRIX_SERVER_NAME"
replace '__AS_TOKEN__' "$IG_AS_TOKEN"
replace '__HS_TOKEN__' "$IG_HS_TOKEN"
replace '__PROVISIONING_SECRET__' "$IG_PROVISIONING_SECRET"
replace 'http://synapse:8008' "$MATRIX_HOMESERVER_URL"
replace 'http://mautrix-instagram:29319' 'http://ig-mobile-bridge.railway.internal:29319'
# The dedicated test topology has no double-puppeting appservice.
yq -i 'del(.double_puppet)' /data/config.yaml
cd /data
exec /usr/bin/mautrix-instagram -c /data/config.yaml
