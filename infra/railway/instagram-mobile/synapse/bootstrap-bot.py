"""Creates only the dedicated test bot; emits no credentials or request bodies."""
import hashlib
import hmac
import json
import os
import time
import urllib.request
from pathlib import Path

base = 'http://127.0.0.1:8008'
def request(path, body=None, token=None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)

for _ in range(120):
    try:
        request('/_matrix/client/versions')
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit('Test homeserver did not become ready')

username = 'claire_bot'
password = os.environ['MATRIX_BOT_PASSWORD']
token_path = Path('/data/claire-bot-token')
if token_path.exists():
    try:
        identity = request('/_matrix/client/v3/account/whoami', token=token_path.read_text())
        if identity['user_id'] == '@claire_bot:' + os.environ['MATRIX_SERVER_NAME']:
            print('Dedicated test bot ready.', flush=True)
            raise SystemExit(0)
    except Exception:
        pass
try:
    nonce = request('/_synapse/admin/v1/register')['nonce']
    message = '\0'.join([nonce, username, password, 'admin'])
    mac = hmac.new(os.environ['SYNAPSE_REGISTRATION_SECRET'].encode(), message.encode(), hashlib.sha1).hexdigest()
    request('/_synapse/admin/v1/register', {'nonce': nonce, 'username': username, 'password': password,
                                          'admin': True, 'mac': mac})
except Exception:
    pass  # Existing bot is verified with its password below; no credential rotation on restart.
try:
    result = request('/_matrix/client/v3/login', {'type': 'm.login.password',
        'identifier': {'type': 'm.id.user', 'user': username}, 'password': password,
        'device_id': 'CLAIRE_INSTAGRAM_TEST', 'initial_device_display_name': 'Claire Instagram mobile staging'})
    token_path.write_text(result['access_token']); token_path.chmod(0o600)
    print('Dedicated test bot ready.', flush=True)
except Exception:
    raise SystemExit('Test bot login failed; no credentials were printed')
