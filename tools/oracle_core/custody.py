"""Hash-bound immutable records reused by proposal and result recovery."""
from pathlib import Path
import hashlib,json,os,tempfile


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value).hexdigest()
def identity(value):return digest(canonical(value))


def immutable(path,value):
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    raw=canonical(value)+b'\n'
    if path.exists():
        if path.is_symlink() or path.read_bytes()!=raw:raise ValueError('Immutable record differs')
        return False
    fd,name=tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        created=True
        try:os.link(name,path)
        except FileExistsError:
            created=False
            if path.read_bytes()!=raw:raise ValueError('Concurrent immutable record differs')
    finally:Path(name).unlink(missing_ok=True)
    return created


def read(path):
    path=Path(path)
    if path.is_symlink():raise ValueError('Custody symlink forbidden')
    raw=path.read_bytes(); value=json.loads(raw)
    if raw!=canonical(value)+b'\n':raise ValueError('Custody canonical bytes changed')
    return value
