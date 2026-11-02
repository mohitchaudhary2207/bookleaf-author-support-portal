import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import './helpers.js';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const specPath = path.join(srcDir, 'docs/openapi.yaml');
const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Routes as implemented: parsed from the router files and the mount table in app.js.
function implementedRoutes() {
  const mounts = { 'auth.js': '/auth', 'books.js': '/books', 'tickets.js': '/tickets', 'events.js': '/events', 'admin.js': '/admin' };
  const out = new Set();
  for (const [file, prefix] of Object.entries(mounts)) {
    const src = fs.readFileSync(path.join(srcDir, 'routes', file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|patch|put|delete)\(\s*'([^']*)'/g)) out.add(`${m[1].toUpperCase()} ${prefix}${m[2] === '/' ? '' : m[2]}`.replace(/:\w+/g, ':p'));
  }
  const app = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
  for (const m of app.matchAll(/api\.(get|post)\('([^']+)'/g)) out.add(`${m[1].toUpperCase()} ${m[2]}`);
  return out;
}
const operations = Object.entries(spec.paths).flatMap(([p, item]) => METHODS.filter((m) => item[m]).map((m) => ({ method: m.toUpperCase(), path: p, op: item[m] })));

describe('OpenAPI specification', () => {
  it('is valid under strict OpenAPI 3.0.x validation with all $refs resolving', async () => {
    const api = await SwaggerParser.validate(specPath);
    assert.match(api.openapi, /^3\.0\./);
  });

  it('documents exactly the routes the server implements (no missing, no phantom endpoints)', () => {
    const documented = new Set(operations.map(({ method, path: p }) => `${method} ${p.replace(/\{\w+\}/g, ':p')}`));
    const implemented = implementedRoutes();
    assert.deepEqual([...implemented].filter((r) => !documented.has(r)), [], 'implemented but undocumented');
    assert.deepEqual([...documented].filter((r) => !implemented.has(r)), [], 'documented but not implemented');
    assert.equal(operations.length, 27);
  });

  it('every successful (2xx) response other than 204 declares a content schema', () => {
    const missing = operations.flatMap(({ method, path: p, op }) => Object.entries(op.responses)
      .filter(([code, r]) => code.startsWith('2') && code !== '204' && !r.content).map(([code]) => `${method} ${p} ${code}`));
    assert.deepEqual(missing, []);
  });

  it('authenticated operations document 401; admin and author-only operations document 403', () => {
    const publicOps = new Set(['GET /health', 'POST /auth/login', 'POST /auth/logout']);
    for (const { method, path: p, op } of operations) {
      const id = `${method} ${p}`;
      if (!publicOps.has(id)) assert.ok(op.responses['401'], `${id} documents 401`);
      if (p.startsWith('/admin')) assert.ok(op.responses['403'], `${id} documents 403`);
      if (p.startsWith('/tickets') && !p.includes('attachments')) assert.ok(op.responses['403'], `${id} documents 403 (author-only)`);
      if (p.includes('{id}')) assert.ok(op.responses['404'] && op.responses['422'], `${id} documents 404/422`);
    }
    for (const id of publicOps) assert.ok(operations.some((o) => `${o.method} ${o.path}` === id));
  });

  it('declares bearer and cookie authentication and applies them globally', () => {
    assert.ok(spec.components.securitySchemes.bearerAuth && spec.components.securitySchemes.cookieAuth);
    assert.deepEqual(spec.security.map((s) => Object.keys(s)[0]).sort(), ['bearerAuth', 'cookieAuth']);
    for (const id of ['GET /health', 'POST /auth/login']) {
      const [method, p] = id.split(' ');
      assert.deepEqual(spec.paths[p][method.toLowerCase()].security, [], `${id} is explicitly public`);
    }
  });

  it('uses one error envelope and documents assignedTo / estimatedCostUsd correctly', () => {
    const error = spec.components.schemas.Error;
    assert.deepEqual(error.required, ['error']);
    assert.deepEqual(error.properties.error.required, ['code', 'message']);
    for (const name of ['Unauthorized', 'Forbidden', 'NotFound', 'ValidationError']) {
      assert.equal(spec.components.responses[name].content['application/json'].schema.$ref, '#/components/schemas/Error');
    }
    const body = spec.paths['/admin/tickets/{id}'].patch.requestBody.content['application/json'].schema;
    assert.equal(body.additionalProperties, false);
    const nullable = body.properties.assignedTo.oneOf.find((s) => s.type === 'integer');
    assert.equal(nullable.nullable, true, 'null is expressed with OpenAPI 3.0 nullable, not type: null');
    assert.ok(!JSON.stringify(spec).includes("'null'") && !JSON.stringify(spec).includes('"type":"null"'));
    assert.equal(spec.components.schemas.AiUsage.properties.estimatedCostUsd.type, 'number');
    assert.ok(spec.components.schemas.AiStatus.properties.lastFailure);
  });
});
