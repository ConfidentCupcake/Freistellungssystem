#!/usr/bin/env node

/*
 * Creates (or resets the password of) the account named by LOGIN_USER /
 * LOGIN_PASSWORD. Run after migrating a fresh database:
 *
 *   npm run migrate up && npm run seed
 *
 * This used to happen implicitly at boot from an in-memory map. It is an
 * explicit step now so that starting the server never silently rewrites a
 * password in the database.
 */

var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

var auth = require('../lib/auth');
var db = require('../lib/db');

var username = process.env.LOGIN_USER || 'admin';
var password = process.env.LOGIN_PASSWORD || 'admin';
// Optional. With one set, the admin can sign in by address as well as by name;
// without it the account simply has none.
var email = process.env.LOGIN_EMAIL || null;

if (!process.env.LOGIN_USER || !process.env.LOGIN_PASSWORD) {
  console.warn('[seed] Using the default admin/admin login. Set LOGIN_USER and LOGIN_PASSWORD to change it.');
}

auth.upsertUser(username, password, { role: 'admin', email: email })
  .then(function(user) {
    console.log('[seed] admin account ready: ' + user.username + ' (id ' + user.id + ')');
  })
  .catch(function(err) {
    console.error('[seed] failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(function() {
    return db.pool.end();
  });
