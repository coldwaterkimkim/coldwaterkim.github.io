#!/usr/bin/env python3
"""Start only the prepared isolated review; never copies or writes production."""
import json, os, shutil, socket, subprocess, time, urllib.request
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
root=Path.home()/'.local/share/coldwaterkim/unified-feed-review'
if not (root/'pb_data/data.db').exists() or not (root/'local-auth.json').exists():raise SystemExit('Prepared isolated DB required')
with socket.socket() as probe:
 if probe.connect_ex(('127.0.0.1',18107))==0:raise SystemExit('Review backend already running')
go=shutil.which('go') or str(Path.home()/'.local/bin/go')
subprocess.run([go,'build','-o',str(root/'pocketbase'),'.'],cwd=repo/'deploy/imac/pocketbase-custom',check=True)
auth=json.loads((root/'local-auth.json').read_text())
subprocess.run([str(root/'pocketbase'),'superuser','upsert',auth['identity'],auth['password'],'--dir='+str(root/'pb_data')],check=True,stdout=subprocess.DEVNULL)
process=subprocess.Popen([str(root/'pocketbase'),'serve','--http=127.0.0.1:18107','--dir='+str(root/'pb_data'),'--migrationsDir='+str(root/'empty-migrations'),'--automigrate=false','--publicDir='+str(repo/'dist-unified-review'),'--siteDir='+str(repo/'dist-unified-review'),'--tusUploadDir='+str(root/'tus'),'--toolJobDir='+str(root/'tool-jobs')],env=dict(os.environ,CWK_RECORDS_V2='1'))
try:
 for attempt in range(90):
  if process.poll() is not None:raise RuntimeError('Review backend exited')
  try:
   request=urllib.request.Request('http://127.0.0.1:18107/api/collections/_superusers/auth-with-password',data=json.dumps(auth).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(request,timeout=2) as response:session=response.read()
   fd=os.open(str(root/'session.json'),os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
   with os.fdopen(fd,'wb') as f:f.write(session)
   print('Review ready http://127.0.0.1:5197',flush=True);break
  except (OSError,ValueError):time.sleep(.5)
 else:raise RuntimeError('Review auth failed')
 process.wait()
except KeyboardInterrupt:pass
finally:
 if process.poll() is None:process.terminate();process.wait(timeout=10)
