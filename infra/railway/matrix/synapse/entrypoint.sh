#!/bin/sh
set -eu

required='MATRIX_SERVER_NAME SYNAPSE_DB_HOST SYNAPSE_DB_USER SYNAPSE_DB_PASSWORD SYNAPSE_DB_NAME SYNAPSE_REGISTRATION_SECRET SYNAPSE_MACAROON_SECRET SYNAPSE_FORM_SECRET WA_AS_TOKEN WA_HS_TOKEN TG_AS_TOKEN TG_HS_TOKEN IG_AS_TOKEN IG_HS_TOKEN DOUBLE_PUPPET_AS_TOKEN DOUBLE_PUPPET_HS_TOKEN DOUBLE_PUPPET_SENDER_LOCALPART'
for key in $required; do
  eval "value=\${$key:-}"
  if [ -z "$value" ]; then echo "Missing required Matrix variable: $key" >&2; exit 1; fi
done

mkdir -p /data/appservices
cp /claire-templates/homeserver.yaml /data/homeserver.yaml
cp /claire-templates/log.config /data/log.config
cp /claire-templates/appservices/*.yaml /data/appservices/

replace() {
  file="$1"; key="$2"; value="$3"
  KEY="$key" VALUE="$value" perl -0pi -e 's/\Q$ENV{KEY}\E/$ENV{VALUE}/g' "$file"
}

replace /data/homeserver.yaml 'claire.local' "$MATRIX_SERVER_NAME"
replace /data/homeserver.yaml 'postgres-synapse' "$SYNAPSE_DB_HOST"
replace /data/homeserver.yaml 'user: synapse' "user: $SYNAPSE_DB_USER"
replace /data/homeserver.yaml 'password: synapse_secret' "password: $SYNAPSE_DB_PASSWORD"
replace /data/homeserver.yaml 'database: synapse' "database: $SYNAPSE_DB_NAME"
replace /data/homeserver.yaml '__REG_SECRET__' "$SYNAPSE_REGISTRATION_SECRET"
replace /data/homeserver.yaml '__MAC_SECRET__' "$SYNAPSE_MACAROON_SECRET"
replace /data/homeserver.yaml '__FORM_SECRET__' "$SYNAPSE_FORM_SECRET"

for file in /data/appservices/*.yaml; do
  replace "$file" 'claire.local' "$MATRIX_SERVER_NAME"
  replace "$file" 'claire\.local' "$MATRIX_SERVER_NAME"
done
replace /data/appservices/whatsapp.yaml 'mautrix-whatsapp' 'mautrixwhatsapp.railway.internal'
replace /data/appservices/telegram.yaml 'mautrix-telegram' 'mautrixtelegram.railway.internal'
replace /data/appservices/instagram.yaml 'mautrix-instagram' 'mautrixinstagram.railway.internal'
replace /data/appservices/whatsapp.yaml '__AS_TOKEN__' "$WA_AS_TOKEN"
replace /data/appservices/whatsapp.yaml '__HS_TOKEN__' "$WA_HS_TOKEN"
replace /data/appservices/telegram.yaml '__AS_TOKEN__' "$TG_AS_TOKEN"
replace /data/appservices/telegram.yaml '__HS_TOKEN__' "$TG_HS_TOKEN"
replace /data/appservices/instagram.yaml '__AS_TOKEN__' "$IG_AS_TOKEN"
replace /data/appservices/instagram.yaml '__HS_TOKEN__' "$IG_HS_TOKEN"
replace /data/appservices/doublepuppet.yaml '__DOUBLE_PUPPET_AS__' "$DOUBLE_PUPPET_AS_TOKEN"
replace /data/appservices/doublepuppet.yaml '__DOUBLE_PUPPET_HS__' "$DOUBLE_PUPPET_HS_TOKEN"
replace /data/appservices/doublepuppet.yaml '__DOUBLE_PUPPET_LOCAL__' "$DOUBLE_PUPPET_SENDER_LOCALPART"

# The official image drops privileges before creating its signing key and
# SQLite/media directories. Railway volumes start owned by root.
chown -R 991:991 /data

exec /start.py run --config-path /data/homeserver.yaml
