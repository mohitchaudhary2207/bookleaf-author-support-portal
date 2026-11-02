import { createDatabase } from './index.js';
import { seedDatabase } from './seed.js';

const force = process.argv.includes('--force');
const db = createDatabase();
const result = seedDatabase(db, { force });
console.log(result.seeded ? 'Database seeded.' : 'Database already has data (use --force to reset).');
