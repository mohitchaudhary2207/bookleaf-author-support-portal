// Release gate: scan the built frontend (client/dist) for secrets and - unless --allow-demo - demo credentials.
// Usage: node scripts/check-bundle.mjs [--allow-demo] [distDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const allowDemo = args.includes('--allow-demo');
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(here, '../client/dist'));

const FORBIDDEN = [
  [/sk-(proj-)?[A-Za-z0-9_-]{20,}/, 'an OpenAI-style API key'],
  [/JWT_SECRET\s*[=:]\s*["'`]?[0-9a-f]{16,}/i, 'a JWT secret value'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];
const DEMO = [[/Author@123|Admin@123/, 'demo passwords'], [/priya\.sharma@email\.com/, 'demo account e-mails']];

if (!fs.existsSync(dist)) { console.error(`check-bundle: ${dist} not found - run "npm run build" first`); process.exit(2); }

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(dist).filter((f) => /\.(js|css|html|map|json)$/.test(f));
const problems = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const [re, label] of [...FORBIDDEN, ...(allowDemo ? [] : DEMO)]) if (re.test(text)) problems.push(`${path.relative(dist, f)}: contains ${label}`);
}
if (problems.length) { console.error(`check-bundle FAILED (${files.length} files scanned):\n  - ${problems.join('\n  - ')}`); process.exit(1); }
console.log(`check-bundle OK: ${files.length} files scanned, no secrets${allowDemo ? '' : ', no demo credentials'}.`);
