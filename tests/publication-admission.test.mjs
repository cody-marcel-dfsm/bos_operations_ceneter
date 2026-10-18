import {execFileSync} from 'node:child_process';
import test from 'node:test';

test('technical review and actual product publication preserve separate authority', () => {
  execFileSync('python3', ['tests/publication_admission_test.py', '-v'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', stdio: 'pipe', timeout: 600000,
  });
});
