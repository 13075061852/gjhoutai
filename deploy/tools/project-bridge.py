#!/usr/bin/python3
"""Root-owned narrow broker. No shell, caller paths, SQL, config writes or arbitrary units."""
import contextlib, grp, hashlib, json, os, pathlib, re, socketserver, stat, subprocess
PROJECTS = {
 'kingpolymer': {'name':'双螺杆配置系统','url':'https://www.kingpolymer.com/','unit':'kingpolymer.service','root':'/opt/kingpolymer/releases/20260910-113059','lifecycle':True},
 'guangjun': {'name':'广俊官网及管理后台','url':'https://www.kingpolymer.com/web/','unit':'guangjun.service','root':'/var/www/guangjun','lifecycle':True},
 'gjhoutai': {'name':'塑料粒子测试分析平台','url':'https://www.kingpolymer.com/gjhoutai/','unit':'gjhoutai.service','root':'/var/www/gjhoutai/app','lifecycle':False},
}
SOCKET='/run/gjhoutai-projects/control.sock'
# Data, credentials and machine-generated dependencies never enter the model context.
DENY=re.compile(r'(secret|credential|password|passwd|private|token|session|auth|\.env|\.pem|\.key|\.sqlite|\.db|backup|\.bak)',re.I)
SKIP={'node_modules','venv','__pycache__','dist','build','coverage','data','runtime','uploads','objects','logs','fixtures','test-results','playwright-report'}
EXT={'.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.css','.md'}
SENSITIVE=re.compile(r'(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{16,}|ghp_[a-zA-Z0-9]{20,})|(?:api[_-]?key|password|passwd|secret|access[_-]?token)\s*[:=]\s*[\"\x27][^\"\x27\n]{6,}[\"\x27])',re.I)
def allowed(parts):
 return bool(parts) and all(not p.startswith('.') and p not in SKIP and not DENY.search(p) for p in parts) and (pathlib.Path(parts[-1]).suffix in EXT or parts[-1]=='package.json')
def show(project):
 p=PROJECTS[project]
 r=subprocess.run(['/usr/bin/systemctl','show',p['unit'],'--property=ActiveState,SubState,MainPID,ActiveEnterTimestamp,WorkingDirectory','--no-pager'],capture_output=True,text=True,timeout=8,check=True)
 fields=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
 return {'id':project,'name':p['name'],'url':p['url'],'service':p['unit'],'permissions':{'read':True,'start':p['lifecycle'],'stop':p['lifecycle'],'edit':False,'deploy':False,'restart':False},'status':fields,'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
def dispatch(req):
 if not isinstance(req,dict) or set(req)-{'operation','project','path','actor','actionId'}: raise ValueError('invalid_request')
 op=req.get('operation'); project=req.get('project')
 if op=='inventory':
  if project is not None: raise ValueError('invalid_project')
  return {'projects':[show(k) for k in PROJECTS], 'scope':'仅此域名的三个项目；不是整台服务器的完整清单'}
 if project not in PROJECTS: raise ValueError('project_not_allowed')
 p=PROJECTS[project]
 if op=='status': return show(project)
 if op in ('start','stop'):
  if not p['lifecycle']: raise PermissionError('project_read_only')
  if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',str(req.get('actor',''))) or not re.fullmatch(r'[a-zA-Z0-9-]{30,50}',str(req.get('actionId',''))): raise ValueError('confirmation_identity_required')
  # Audit goes to journald, never to user-provided paths.
  print(json.dumps({'event':'project_lifecycle_requested','project':project,'operation':op,'actor':req['actor'],'actionId':req['actionId']}),flush=True)
  r=subprocess.run(['/usr/bin/systemctl',op,p['unit']],capture_output=True,text=True,timeout=40)
  print(json.dumps({'event':'project_lifecycle_finished','project':project,'operation':op,'actionId':req['actionId'],'exitCode':r.returncode}),flush=True)
  if r.returncode: raise RuntimeError('systemd_operation_failed')
  return show(project)
 root=pathlib.Path(p['root']).resolve(strict=True)
 if op=='tree':
  files=[]; truncated=False
  for base,dirs,names in os.walk(root,followlinks=False):
   dirs[:]=sorted(d for d in dirs if not d.startswith('.') and d not in SKIP and not DENY.search(d) and not (pathlib.Path(base)/d).is_symlink())
   for n in sorted(names):
    candidate=pathlib.Path(base)/n; parts=candidate.relative_to(root).parts
    if allowed(parts) and not candidate.is_symlink():
     files.append('/'.join(parts))
     if len(files)>=300: truncated=True; break
   if truncated: break
  return {'project':project,'files':files,'truncated':truncated,'notice':'仅可读源码/文档清单，排除配置凭据、数据、依赖及构建产物'}
 if op=='read':
  value=req.get('path')
  if not isinstance(value,str) or len(value)>300 or '\\' in value: raise ValueError('invalid_path')
  rel=pathlib.PurePosixPath(value)
  if rel.is_absolute() or '..' in rel.parts or not allowed(rel.parts): raise PermissionError('file_not_allowed')
  f=root.joinpath(*rel.parts)
  for i in range(1,len(rel.parts)+1):
   if root.joinpath(*rel.parts[:i]).is_symlink(): raise PermissionError('symlink_not_allowed')
  f=f.resolve(strict=True)
  if not f.is_relative_to(root) or not f.is_file() or f.stat().st_size>65536: raise PermissionError('file_not_allowed_or_too_large')
  # Walk via directory descriptors so replacing an ancestor with a symlink
  # between validation and open cannot escape the approved project root.
  with contextlib.ExitStack() as stack:
   parent=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);stack.callback(os.close,parent)
   for part in rel.parts[:-1]:
    parent=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);stack.callback(os.close,parent)
   fd=os.open(rel.parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
   with os.fdopen(fd,'rb') as stream:
    info=os.fstat(stream.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_size>65536: raise PermissionError('file_not_allowed_or_too_large')
    raw=stream.read(65537)
  if len(raw)>65536 or b'\x00' in raw: raise PermissionError('file_not_allowed_or_too_large')
  text=raw.decode('utf-8')
  if SENSITIVE.search(text): raise PermissionError('file_may_contain_secrets')
  return {'project':project,'path':value,'content':text,'sha256':hashlib.sha256(raw).hexdigest(),'readOnly':True,'untrustedContent':True}
 raise PermissionError('operation_not_allowed')
class Handler(socketserver.StreamRequestHandler):
 def handle(self):
  self.request.settimeout(45)
  try:
   data=self.rfile.readline(4097)
   if len(data)>4096 or not data.endswith(b'\n'): raise ValueError('invalid_request')
   result={'ok':True,'result':dispatch(json.loads(data))}
  except Exception as e:
   result={'ok':False,'error':str(e) if isinstance(e,(ValueError,PermissionError,RuntimeError)) else 'broker_read_failed'}
  try: self.wfile.write((json.dumps(result,ensure_ascii=False)+'\n').encode())
  except (BrokenPipeError,ConnectionResetError): pass
if __name__=='__main__':
 if os.path.exists(SOCKET): os.unlink(SOCKET)
 with socketserver.UnixStreamServer(SOCKET,Handler) as server:
  os.chown(SOCKET,0,grp.getgrnam('gjhoutai').gr_gid);os.chmod(SOCKET,0o660)
  server.serve_forever()
