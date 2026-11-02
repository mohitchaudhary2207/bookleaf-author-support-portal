import { config } from '../config/index.js';

const silent = config.isTest;
const stamp = () => new Date().toISOString();

export const logger = {
  info: (...a) => !silent && console.log(stamp(), 'INFO ', ...a),
  warn: (...a) => !silent && console.warn(stamp(), 'WARN ', ...a),
  error: (...a) => !silent && console.error(stamp(), 'ERROR', ...a),
};
