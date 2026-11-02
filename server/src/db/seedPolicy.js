/**
 * Decides whether - and with which passwords - the demo dataset may be seeded into an empty database.
 *
 *   development / test : seeding is ON by default (the documented demo accounts), may be switched off
 *                        with SEED_DEMO_DATA=false. Missing passwords fall back to the dev defaults.
 *   production         : seeding is OFF by default. It runs only when SEED_DEMO_DATA=true is set
 *                        explicitly (an isolated evaluation/demo deployment), and then BOTH
 *                        SEED_AUTHOR_PASSWORD and SEED_ADMIN_PASSWORD must be provided. There is no
 *                        built-in fallback password in production.
 *
 * Pure function of the environment, so it can be tested without touching a database.
 */
export const DEV_DEFAULTS = { authorPassword: 'Author@123', adminPassword: 'Admin@123' };
export const MIN_PASSWORD_LENGTH = 8;

const parseBool = (value) => {
  if (value === undefined || value === '') return undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export function resolveSeedPolicy(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const explicit = parseBool(env.SEED_DEMO_DATA);
  const enabled = isProd ? explicit === true : explicit !== false;

  if (!enabled) {
    return {
      enabled: false,
      reason: isProd
        ? 'Demo seeding is disabled in production (set SEED_DEMO_DATA=true only for an isolated evaluation deployment).'
        : 'Demo seeding disabled by SEED_DEMO_DATA=false.',
    };
  }

  if (isProd) {
    const authorPassword = env.SEED_AUTHOR_PASSWORD;
    const adminPassword = env.SEED_ADMIN_PASSWORD;
    const missing = [['SEED_AUTHOR_PASSWORD', authorPassword], ['SEED_ADMIN_PASSWORD', adminPassword]]
      .filter(([, v]) => !v || v.length < MIN_PASSWORD_LENGTH).map(([k]) => k);
    if (missing.length) {
      throw new Error(`SEED_DEMO_DATA=true in production requires ${missing.join(' and ')} (at least ${MIN_PASSWORD_LENGTH} characters). Refusing to seed with default passwords.`);
    }
    return { enabled: true, authorPassword, adminPassword, reason: 'Explicit production demo seeding (SEED_DEMO_DATA=true).' };
  }

  return {
    enabled: true,
    authorPassword: env.SEED_AUTHOR_PASSWORD || DEV_DEFAULTS.authorPassword,
    adminPassword: env.SEED_ADMIN_PASSWORD || DEV_DEFAULTS.adminPassword,
    reason: 'Development/test demo seeding.',
  };
}
