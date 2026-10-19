"""Single-user, isolated test homeserver. Writes secrets only to its private volume."""
import json
import os
import re
from pathlib import Path

root = Path('/data')
root.mkdir(exist_ok=True)
domain = os.environ['MATRIX_SERVER_NAME']
config = {
    'server_name': domain, 'pid_file': '/data/homeserver.pid',
    'listeners': [{'port': 8008, 'type': 'http', 'tls': False, 'x_forwarded': True,
                   'resources': [{'names': ['client'], 'compress': False}]}],
    'database': {'name': 'sqlite3', 'args': {'database': '/data/homeserver.db'}},
    'media_store_path': '/data/media', 'signing_key_path': '/data/signing.key',
    'registration_shared_secret': os.environ['SYNAPSE_REGISTRATION_SECRET'],
    'macaroon_secret_key': os.environ['SYNAPSE_MACAROON_SECRET'],
    'form_secret': os.environ['SYNAPSE_FORM_SECRET'],
    'enable_registration': False, 'report_stats': False, 'trusted_key_servers': [],
    'federation_domain_whitelist': [], 'app_service_config_files': ['/data/instagram.yaml'],
    'rc_message': {'per_second': 100, 'burst_count': 500},
}
registration = {
    'id': 'meta', 'url': 'http://ig-mobile-bridge.railway.internal:29319',
    'as_token': os.environ['IG_AS_TOKEN'], 'hs_token': os.environ['IG_HS_TOKEN'],
    'sender_localpart': 'instagram_appservice', 'rate_limited': False,
    'namespaces': {'users': [{'regex': '^@(?:metabot|meta_.*):' + re.escape(domain) + '$', 'exclusive': True}]},
    'de.sorunome.msc2409.push_ephemeral': True, 'receive_ephemeral': True,
}
for name, value in [('homeserver.yaml', config), ('instagram.yaml', registration)]:
    (root / name).write_text(json.dumps(value))
    (root / name).chmod(0o600)
