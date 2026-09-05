#!/usr/bin/env python3
"""Restart the existing isolated review runtime; never copies production data."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

repo = Path(__file__).resolve().parents[1]
runtime = Path.home() / '.local/share/coldwaterkim/records-v2-preview'
if not (runtime / 'pb_data/data.db').is_file() or not (runtime / 'local-auth.json').is_file():
    raise SystemExit('Prepared isolated preview database/account required. No production fallback.')
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 18096)) == 0:
        raise SystemExit('Preview backend already running on 18096; use npm run dev:records.')
go = shutil.which('go') or str(Path.home() / '.local/bin/go')
subprocess.run([go, 'build', '-o', str(runtime / 'pocketbase'), '.'],
               cwd=repo / 'deploy/imac/pocketbase-custom', check=True)
env = dict(os.environ, CWK_RECORDS_V2='1')
process = subprocess.Popen([
    str(runtime / 'pocketbase'), 'serve', '--http=127.0.0.1:18096',
    '--dir=' + str(runtime / 'pb_data'), '--migrationsDir=' + str(runtime / 'empty-migrations'),
    '--automigrate=false', '--publicDir=' + str(runtime / 'public'),
    '--siteDir=' + str(repo / 'dist-records-preview'),
    '--tusUploadDir=' + str(runtime / 'tus'), '--toolJobDir=' + str(runtime / 'tool-jobs'),
], env=env)
try:
    auth = json.loads((runtime / 'local-auth.json').read_text())
    for attempt in range(60):
        if process.poll() is not None:
            raise RuntimeError('Preview backend exited before login')
        try:
            request = urllib.request.Request(
                'http://127.0.0.1:18096/api/collections/_superusers/auth-with-password',
                data=json.dumps(auth).encode(), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=3) as response:
                session = response.read()
            session_path = runtime / 'session.json'
            fd = os.open(session_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'wb') as target:
                target.write(session)
            print('Isolated preview ready: http://127.0.0.1:5196/records/', flush=True)
            break
        except (OSError, ValueError):
            time.sleep(0.5)
    else:
        raise RuntimeError('Could not create the local review session')
    process.wait()
except KeyboardInterrupt:
    pass
finally:
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
