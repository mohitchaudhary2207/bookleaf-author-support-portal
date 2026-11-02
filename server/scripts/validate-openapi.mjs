// Strict OpenAPI validation (OpenAPI 3.0.x schema + $ref resolution). Exit code 1 on any problem.
// Usage: npm run validate:openapi
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/docs/openapi.yaml');
try {
  const api = await SwaggerParser.validate(file);
  const ops = Object.values(api.paths).reduce((n, p) => n + Object.keys(p).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k)).length, 0);
  console.log(`OpenAPI ${api.openapi} valid: "${api.info.title}" v${api.info.version} - ${Object.keys(api.paths).length} paths, ${ops} operations, ${Object.keys(api.components.schemas).length} schemas`);
} catch (err) {
  console.error('OpenAPI validation FAILED:\n' + String(err.message).split('\n').slice(0, 12).join('\n'));
  process.exit(1);
}
