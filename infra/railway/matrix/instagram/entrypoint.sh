#!/bin/sh
set -eu
mkdir -p /data
cp /claire-config.template.yaml /data/config.yaml
cp /claire-registration.template.yaml /data/registration.yaml
replace() { file="$1"; key="$2"; value="$3"; sed -i "s|$key|$value|g" "$file"; }
replace /data/config.yaml 'claire.local' "$MATRIX_SERVER_NAME"
replace /data/config.yaml 'synapse' 'synapse.railway.internal'
replace /data/config.yaml 'mautrix-instagram' 'mautrixinstagram.railway.internal'
replace /data/config.yaml '__AS_TOKEN__' "$IG_AS_TOKEN"
replace /data/config.yaml '__HS_TOKEN__' "$IG_HS_TOKEN"
replace /data/config.yaml '__DOUBLE_PUPPET_AS__' "$DOUBLE_PUPPET_AS_TOKEN"
replace /data/config.yaml '__PROVISIONING_SECRET__' "$IG_PROVISIONING_SECRET"
replace /data/registration.yaml 'claire.local' "$MATRIX_SERVER_NAME"
replace /data/registration.yaml 'mautrix-instagram' 'mautrixinstagram.railway.internal'
replace /data/registration.yaml '__AS_TOKEN__' "$IG_AS_TOKEN"
replace /data/registration.yaml '__HS_TOKEN__' "$IG_HS_TOKEN"
exec /docker-run.sh
