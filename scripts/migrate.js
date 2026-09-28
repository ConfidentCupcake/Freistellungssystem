#!/usr/bin/env node

/*
 * Runs the node-pg-migrate CLI with .env loaded first, since the CLI reads
 * DATABASE_URL from the real environment and does not know about our .env.
 *
 *   npm run migrate up            apply pending migrations
 *   npm run migrate down          roll the last one back
 *   npm run migrate create <name> scaffold a new migration file
 */

var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

var spawn = require('child_process').spawn;

// npm puts node_modules/.bin on PATH for scripts it runs; shell: true is what
// lets Windows resolve the .cmd shim there.
var child = spawn('node-pg-migrate', process.argv.slice(2), {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..')
});

child.on('exit', function(code) {
  process.exit(code === null ? 1 : code);
});
