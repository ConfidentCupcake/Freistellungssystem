var pg = require('pg');

/*
 * The one connection pool for the process. Everything that touches the
 * database goes through here — including the session store in app.js, so
 * sessions and queries share the same connections.
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env, and run `npm run db:up` ' +
    'to start the local Postgres from docker-compose.yml.'
  );
}

var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// An idle pooled client can be dropped by the server (restart, timeout). Without
// a listener here that surfaces as an unhandled 'error' event and takes the
// process down; the pool discards the bad client and carries on by itself.
pool.on('error', function(err) {
  console.error('[db] idle client error:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool: pool,
  query: query
};
