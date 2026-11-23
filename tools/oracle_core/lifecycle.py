"""Explicit no-replay proposal intent and completed-result recovery."""
from pathlib import Path
from .custody import immutable,read,identity


def begin(state,binding):
    operation=identity(binding);directory=Path(state)/'operations'/operation
    created=immutable(directory/'intent.json',binding)
    return operation,directory,created


def retain_result(directory,binding,result):
    immutable(Path(directory)/'result.json',{'binding_sha256':identity(binding),'result':result,'result_sha256':identity(result)})


def completed(directory,binding):
    if read(Path(directory)/'intent.json')!=binding:raise ValueError('Stale operation input or runtime')
    value=read(Path(directory)/'result.json')
    if value['binding_sha256']!=identity(binding) or value['result_sha256']!=identity(value['result']):raise ValueError('Completed result custody changed')
    return value['result']
