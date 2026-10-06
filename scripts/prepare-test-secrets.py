#!/usr/bin/env python3
"""Generate only independent webhook/session secrets outside Git; never display values."""
import argparse,os,pathlib,secrets,stat,subprocess,tempfile
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--copy',choices=['webhookSecret','sessionSecret'])
p.add_argument('--directory',type=pathlib.Path)
a=p.parse_args()
os.umask(0o077)
if a.copy:
 if not a.directory:p.error('--copy requires the previously generated --directory')
 directory=a.directory.resolve()
 info=directory.stat()
 if info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o700:p.error('Directory must be owned by you with mode 0700')
 file=directory/(a.copy+'.txt')
 fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  info=os.fstat(stream.fileno())
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o600:p.error('Secret must be your regular 0600 file')
  value=stream.read(128).strip()
 if len(value)!=64 or any(c not in b'0123456789abcdef' for c in value):p.error('Invalid generated secret format')
 subprocess.run(['/usr/bin/pbcopy'],input=value,check=True)
 print('Copied privately to clipboard. Paste into AWS, then clear clipboard with: pbcopy < /dev/null')
else:
 if a.directory:p.error('Generation chooses a fresh private temporary directory; do not supply --directory')
 directory=pathlib.Path(tempfile.mkdtemp(prefix='khaga-test-secrets-',dir='/private/tmp'))
 for name in ['webhookSecret','sessionSecret']:
  fd=os.open(directory/(name+'.txt'),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as stream:stream.write(secrets.token_hex(32)+'\n')
 print('Private directory (no secret values displayed):',directory)
 print('Directory mode 0700; two files mode 0600. Transfer privately to your password manager and AWS before temporary storage is cleaned.')
