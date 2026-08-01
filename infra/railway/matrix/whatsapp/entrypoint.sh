#!/bin/sh
set -eu
mkdir -p /data
cp /claire-config.template.yaml /data/config.yaml
cp /claire-registration.template.yaml /data/registration.yaml
replace() { file="$1"; key="$2"; value="$3"; sed -i "s|$key|$value|g" "$file"; }
replace /data/config.yaml 'claire.local' "$MATRIX_SERVER_NAME"
replace /data/config.yaml 'http://synapse:8008' 'http://synapse.railway.internal:8008'
replace /data/config.yaml 'http://mautrix-whatsapp:29318' 'http://mautrixwhatsapp.railway.internal:29318'
replace /data/config.yaml '__AS_TOKEN__' "$WA_AS_TOKEN"
replace /data/config.yaml '__HS_TOKEN__' "$WA_HS_TOKEN"
replace /data/config.yaml '__DOUBLE_PUPPET_AS__' "$DOUBLE_PUPPET_AS_TOKEN"
replace /data/config.yaml '__PROVISIONING_SECRET__' "$WA_PROVISIONING_SECRET"
replace /data/registration.yaml 'claire.local' "$MATRIX_SERVER_NAME"
replace /data/registration.yaml 'http://mautrix-whatsapp:29318' 'http://mautrixwhatsapp.railway.internal:29318'
replace /data/registration.yaml '__AS_TOKEN__' "$WA_AS_TOKEN"
replace /data/registration.yaml '__HS_TOKEN__' "$WA_HS_TOKEN"
echo "[claire] WhatsApp bridge config generated; checking Synapse private network"
if curl -fsS --max-time 5 http://synapse.railway.internal:8008/_matrix/client/versions >/dev/null; then
  echo "[claire] Synapse private network check passed"
else
  echo "[claire] Synapse private network check failed"
fi
echo "[claire] Starting mautrix-whatsapp directly with generated config"
echo "[claire] Generated config uses bridgev2 database layout"
set +e
su-exec 1337:1337 /usr/bin/mautrix-whatsapp -c /data/config.yaml
exit_code=$?
set -e
echo "[claire] WhatsApp bridge process exited with code $exit_code"
exit "$exit_code"
