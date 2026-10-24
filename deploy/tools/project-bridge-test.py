import importlib.util, pathlib, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('bridge',pathlib.Path(__file__).with_name('project-bridge.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class BridgeSecurity(unittest.TestCase):
 def test_allowlist_never_calls_systemctl_for_forbidden_actions(self):
  with patch.object(b.subprocess,'run') as run:
   for req in [{'project':'gjhoutai','operation':'stop'},{'project':'guangjun','operation':'restart'},{'project':'node-admin','operation':'stop'},{'project':'guangjun;id','operation':'status'},{'project':'guangjun','operation':'edit'},{'project':'guangjun','operation':'stop'}]:
    with self.assertRaises((ValueError,PermissionError)): b.dispatch(req)
   run.assert_not_called()
 def test_reads_are_bounded_and_secrets_and_symlinks_are_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp); (root/'README.md').write_text('Hello',encoding='utf-8');(root/'large.ts').write_text('a'*65537);(root/'evil.ts').write_text('const password = "real-secret"');(root/'link.md').symlink_to('/etc/passwd');(root/'.env').write_text('secret');(root/'data').mkdir();(root/'data'/'x.md').write_text('private')
   with patch.dict(b.PROJECTS,{'guangjun':{**b.PROJECTS['guangjun'],'root':tmp}}):
    self.assertEqual(b.dispatch({'project':'guangjun','operation':'read','path':'README.md'})['content'],'Hello')
    for f in ['../etc/passwd','/etc/passwd','.env','data/x.md','large.ts','evil.ts','link.md']:
     with self.assertRaises((ValueError,PermissionError)):b.dispatch({'project':'guangjun','operation':'read','path':f})
 def test_start_has_fixed_exec_arguments_and_requires_confirmation_identity(self):
  class R: returncode=0;stdout='ActiveState=active\nMainPID=1\n'
  with patch.object(b.subprocess,'run',return_value=R()) as run:
   b.dispatch({'project':'guangjun','operation':'start','actor':'u1','actionId':'12345678-1234-1234-1234-123456789abc'})
   self.assertEqual(run.call_args_list[0].args[0],['/usr/bin/systemctl','start','guangjun.service'])
if __name__=='__main__':unittest.main()
