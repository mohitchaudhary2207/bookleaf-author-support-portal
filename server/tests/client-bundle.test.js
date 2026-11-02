import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const clientDir = path.join(repoRoot, 'client');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookleaf-bundle-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const vite = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
function build(name, viteShowDemo) {
  const out = path.join(tmp, name);
  const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, NODE_ENV: 'production', ...(viteShowDemo === undefined ? {} : { VITE_SHOW_DEMO: viteShowDemo }) };
  execFileSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: clientDir, env, stdio: 'pipe' });
  return out;
}
const check = (dir, ...flags) => execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'check-bundle.mjs'), ...flags, dir], { stdio: 'pipe' }).toString();
const bundleText = (dir) => fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8')).join('\n');

describe('VITE_SHOW_DEMO controls whether demo credentials reach the production bundle (real vite builds)', () => {
  it('default production build (flag unset): NO demo passwords or demo e-mails, no demo chunk', () => {
    const dir = build('default', undefined);
    const text = bundleText(dir);
    assert.ok(!/Author@123|Admin@123/.test(text));
    assert.ok(!/priya\.sharma@email\.com/.test(text));
    assert.ok(!fs.readdirSync(path.join(dir, 'assets')).some((f) => /DemoAccounts/.test(f)));
    assert.match(check(dir), /check-bundle OK/);
  });

  it('VITE_SHOW_DEMO=false: same as default', () => {
    const dir = build('false', 'false');
    assert.ok(!/Author@123|Admin@123/.test(bundleText(dir)));
  });

  it('VITE_SHOW_DEMO=true: opt-in demo panel is emitted as its own chunk (and the release gate flags it)', () => {
    const dir = build('true', 'true');
    assert.ok(/Author@123/.test(bundleText(dir)), 'opt-in build contains the demo panel');
    assert.throws(() => check(dir), (e) => /demo passwords/.test(String(e.stderr)));
    assert.match(check(dir, '--allow-demo'), /check-bundle OK/);
  });

  it('no build ever contains an API key / JWT secret', () => {
    for (const dir of [build('s1', undefined), build('s2', 'true')]) assert.ok(!/sk-(proj-)?[A-Za-z0-9_-]{20,}/.test(bundleText(dir)));
  });
});
