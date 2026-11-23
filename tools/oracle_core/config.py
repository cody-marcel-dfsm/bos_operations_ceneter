"""Explicit project/policy/corpus/model ports; no ambient workspace discovery."""
from pathlib import Path
import json


def relative(root, name, *, exists=True):
    if not isinstance(name,str) or not name or Path(name).is_absolute() or '..' in Path(name).parts:
        raise ValueError('Expected a safe relative project path')
    root=Path(root).resolve(); candidate=root/name
    if candidate.is_symlink() or any(p.is_symlink() for p in candidate.parents if p!=root and p.is_relative_to(root)):
        raise ValueError('Project input symlinks are forbidden')
    path=candidate.resolve(strict=exists)
    if not path.is_relative_to(root):raise ValueError('Project input escapes explicit root')
    return path


def load(path):
    path=Path(path).resolve(strict=True); root=path.parent
    value=json.loads(path.read_text())
    if set(value)!={'project','policy','catalog','corpus','state','runner'} or not isinstance(value['project'],str) or not value['project'].strip():
        raise ValueError('Complete closed project configuration required')
    if set(value['corpus'])!={'root','sources'} or not isinstance(value['corpus']['sources'],list):raise ValueError('Explicit corpus allowlist required')
    for key in ['policy','catalog']:relative(root,value[key])
    corpus=relative(root,value['corpus']['root'])
    for name in value['corpus']['sources']:relative(corpus,name)
    state=relative(root,value['state'],exists=False)
    if state==root or state==corpus or state.is_relative_to(corpus):raise ValueError('State must be separate from corpus')
    r=value['runner']
    if set(r)!={'engine','executable','model','reasoning_effort','timeout_seconds','sandbox','max_output_bytes'}:raise ValueError('Complete closed runner configuration required')
    if r['engine'] not in ['codex','claude'] or r['executable']!=r['engine'] or not isinstance(r['model'],str) or not r['model'].strip():raise ValueError('Explicit existing CLI engine/model required')
    if r['reasoning_effort'] not in ['low','medium'] or r['sandbox']!='read-only':raise ValueError('Unsupported model capability')
    if type(r['timeout_seconds']) is not int or not 1<=r['timeout_seconds']<=90:raise ValueError('Bounded model timeout required')
    if type(r['max_output_bytes']) is not int or not 1<=r['max_output_bytes']<=8388608:raise ValueError('Bounded model output required')
    return root,value
