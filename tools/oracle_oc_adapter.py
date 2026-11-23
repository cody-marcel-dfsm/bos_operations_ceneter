"""OC policy/knowledge adapters for the portable actual Oracle mechanisms."""
from pathlib import Path
try:
    from .oracle_core.index import Index
except ImportError:
    from oracle_core.index import Index

def vault_store(owner):
    """Keep OC discovery/runtime/locks and test seams; share actual index algorithms."""
    class Store(Index):
        def snapshot(self):return owner.snapshot()
        def index_configuration(self):return owner.index_configuration()
        def get_collection(self):return owner.get_collection()
        def write_manifest(self,payload):return owner.write_manifest(payload)
    value=Store.__new__(Store)
    value.root=owner.PROJECT_ROOT
    value.manifests=owner.MANIFEST_DIR
    value.directory=owner.CHROMA_DIR
    value.collection_name=owner.COLLECTION_NAME
    return value


def generate_compatibility(root):
    """Project the canonical formula into the pre-existing standalone build helper."""
    root=Path(root)
    body=(root/'tools/oracle_core/seal.py').read_bytes()
    (root/'tools/oracle_spec_seal.py').write_bytes(b'# Generated from tools/oracle_core/seal.py; edit the canonical core and regenerate.\n'+body)


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--generate-compatibility',action='store_true',required=True)
    parser.parse_args()
    generate_compatibility(Path(__file__).resolve().parent.parent)
