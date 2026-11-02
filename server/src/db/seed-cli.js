import { createDatabase } from './index.js';
import { seedDatabase } from './seed.js';
import { resolveSeedPolicy } from './seedPolicy.js';

const force = process.argv.includes('--force');
const policy = resolveSeedPolicy(); // same rules as server start-up: production needs SEED_DEMO_DATA=true + explicit passwords
if (!policy.enabled) {
  console.log(policy.reason);
  process.exit(0);
}
const db = createDatabase();
const result = seedDatabase(db, { force, authorPassword: policy.authorPassword, adminPassword: policy.adminPassword });
console.log(result.seeded ? 'Database seeded.' : 'Database already has data (use --force to reset).');
