#!/bin/sh
set -eu
umask 077
python /claire/configure.py
chown -R 991:991 /data
python /claire/bootstrap-bot.py &
exec /start.py run --config-path /data/homeserver.yaml
