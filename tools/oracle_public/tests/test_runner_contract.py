"""Explicit configuration guards; these tests invoke no model or provider."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from oracle_core.config import load

ROOT = Path(__file__).resolve().parents[1]


class RunnerConfiguration(unittest.TestCase):
    def test_current_public_configuration_is_explicit(self):
        root, value = load(ROOT / 'oracle.project.json')
        self.assertEqual(root, ROOT)
        self.assertEqual(value['runner']['sandbox'], 'read-only')
        self.assertTrue(value['runner']['model'])
        self.assertLessEqual(value['runner']['timeout_seconds'], 90)

    def test_missing_or_overbroad_capabilities_fail_without_execution(self):
        scratch = ROOT / '.oracle' / 'test-fixtures'
        scratch.mkdir(parents=True, exist_ok=True)
        for mutate in [lambda c: c['runner'].update(sandbox='danger-full-access'),
                       lambda c: c['runner'].update(timeout_seconds=91),
                       lambda c: c['runner'].update(model=''),
                       lambda c: c.update(ambient_credentials=True)]:
            with tempfile.TemporaryDirectory(dir=scratch) as name:
                folder = Path(name)
                for source in ['policy', 'corpus']:
                    shutil.copytree(ROOT / source, folder / source)
                shutil.copyfile(ROOT / 'validation-catalog.json', folder / 'validation-catalog.json')
                config = json.loads((ROOT / 'oracle.project.json').read_text())
                mutate(config)
                path = folder / 'oracle.project.json'
                path.write_text(json.dumps(config))
                with self.assertRaises(ValueError):
                    load(path)


if __name__ == '__main__':
    unittest.main()
