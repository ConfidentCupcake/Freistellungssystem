var crypto = require('crypto');

var db = require('./db');

/*
 * Credentials live in the `users` table (see migrations/). Passwords are
 * stored as `salt:scryptHash`, never in plaintext.
 *
 * `scryptSync` blocks the event loop for ~100ms per call. That is deliberate
 * cost against offline cracking and is fine at this app's login volume; if
 * logins ever get hot, move to the async `crypto.scrypt`.
 */

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  var derived = crypto.scryptSync(password, salt, 64);
  return salt + ':' + derived.toString('hex');
}

function verifyPassword(password, stored) {
  var parts = String(stored).split(':');
  if (parts.length !== 2) return false;

  var expected = Buffer.from(parts[1], 'hex');
  var actual = crypto.scryptSync(password, parts[0], expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Compared against when the username is unknown, so a bad username costs the
// same time as a bad password and cannot be distinguished from outside.
var DUMMY_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));

// What goes into the session and out to the client. Never the password hash.
// `created_at` is only selected by some queries; JSON drops it when undefined.
function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at
  };
}

// The e-mail address is optional, so an empty field means "no address" rather
// than "invalid" — hence null instead of an error. The shape check is
// deliberately loose and matches the users_email_shape constraint: it exists to
// catch a typo, not to decide what a deliverable address looks like. The DB
// enforces the same rule; validating here only buys the German message.
function normalizeEmail(email) {
  email = String(email == null ? '' : email).trim();
  if (!email) return null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Das ist keine gültige E-Mail-Adresse.');
  }

  return email;
}

// Creates the user, or updates the password of an existing one. Used by the
// seed script; a real admin screen would want separate create/update paths.
// `options.role` only applies to a freshly created account: roles are fixed at
// creation and the database refuses to change one, so re-running this against an
// existing user leaves their role alone rather than failing on the trigger.
async function upsertUser(username, password, options) {
  options = options || {};

  var result = await db.query(
    `INSERT INTO users (username, password_hash, display_name, email, role)
          VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lower(username)) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                display_name  = COALESCE(EXCLUDED.display_name, users.display_name),
                email         = COALESCE(EXCLUDED.email, users.email)
      RETURNING id, username, email, display_name, role`,
    [
      username,
      hashPassword(password),
      options.displayName || null,
      normalizeEmail(options.email),
      options.role || 'teilnehmer'
    ]
  );

  return publicUser(result.rows[0]);
}

// Creates a brand new account. Unlike upsertUser this never touches an existing
// one — the admin dashboard must not be able to silently reset somebody's
// password by reusing their name. Both failure modes the caller cares about
// come back as errors carrying a `status`, which the API routes pass straight
// on: a duplicate name (unique_violation) and a role the user_role enum does
// not know (invalid_text_representation).
async function createUser(username, password, role, email) {
  username = String(username == null ? '' : username).trim();
  email = normalizeEmail(email);

  if (!username) throw httpError(400, 'Benutzername darf nicht leer sein.');
  if (!password) throw httpError(400, 'Passwort darf nicht leer sein.');
  // Caught here rather than left to users_username_not_email, which would come
  // back as a bare 23514 with no message worth showing anyone.
  if (username.indexOf('@') !== -1) {
    throw httpError(400, 'Der Benutzername darf kein @ enthalten — dafür ist das E-Mail-Feld da.');
  }

  try {
    // The ::user_role cast is load-bearing: inside COALESCE, pg would otherwise
    // infer text for $3 and the INSERT fails before the enum is ever consulted.
    var result = await db.query(
      `INSERT INTO users (username, password_hash, role, email)
            VALUES ($1, $2, COALESCE($3::user_role, 'teilnehmer'), $4)
        RETURNING id, username, email, display_name, role, created_at`,
      [username, hashPassword(password), role || null, email]
    );

    return publicUser(result.rows[0]);
  } catch (err) {
    // Two unique indexes can raise 23505 now, and telling the admin which one
    // they hit is the whole point of the message.
    if (err.code === '23505') {
      if (err.constraint === 'users_email_lower_key') {
        throw httpError(409, 'Diese E-Mail-Adresse wird bereits verwendet.');
      }
      throw httpError(409, 'Diesen Benutzernamen gibt es bereits.');
    }
    if (err.code === '22P02') throw httpError(400, 'Unbekannte Rolle.');
    throw err;
  }
}

// Sets a new password for an existing account. `keepSid` is the acting admin's
// own session id: every other session of that user is dropped, so a reset
// password actually locks the old holder out, while an admin changing their own
// password stays signed in where they are.
async function setPassword(id, password, keepSid) {
  id = Number(id);
  if (!Number.isInteger(id)) throw httpError(400, 'Ungültige Benutzer-ID.');
  if (!password) throw httpError(400, 'Passwort darf nicht leer sein.');

  var client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    var result = await client.query(
      'UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id',
      [id, hashPassword(password)]
    );
    if (!result.rowCount) throw httpError(404, 'Diesen Benutzer gibt es nicht.');

    await client.query(
      "DELETE FROM session WHERE (sess->'user'->>'id')::int = $1 AND sid <> COALESCE($2, '')",
      [id, keepSid || null]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Removes an account. `actorId` is the admin doing it: deleting your own
// account would destroy the session you are working in, so that is refused.
//
// A user who still holds Freistellungen cannot be deleted at all — both foreign
// keys pointing at them are ON DELETE RESTRICT — and that comes back as a 409
// rather than a 500. Their sessions go first: without that, someone signed in as
// the deleted account would keep a working session cookie for up to eight hours,
// since requireAuth only ever looks at the session.
async function deleteUser(id, actorId) {
  id = Number(id);
  if (!Number.isInteger(id)) throw httpError(400, 'Ungültige Benutzer-ID.');
  if (id === actorId) throw httpError(409, 'Sie können Ihr eigenes Konto nicht löschen.');

  var client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM session WHERE (sess->'user'->>'id')::int = $1", [id]);

    var result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) throw httpError(404, 'Diesen Benutzer gibt es nicht.');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      throw httpError(409, 'Der Benutzer hat noch Freistellungen und kann nicht gelöscht werden.');
    }
    throw err;
  } finally {
    client.release();
  }
}

function httpError(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

// Every account, newest last. The password hash never leaves this module.
async function listUsers() {
  var result = await db.query(
    'SELECT id, username, email, display_name, role, created_at FROM users ORDER BY id'
  );

  return result.rows.map(publicUser);
}

// The Berufstrainer a Freistellung can be assigned to, for the request form's
// dropdown. Deliberately narrower than listUsers: id and a display name only,
// and only the one role — this is the single user listing a non-admin may see,
// so it hands out nothing else (no e-mail addresses, no other accounts).
async function listBerufstrainer() {
  var result = await db.query(
    `SELECT id, username, display_name
       FROM users
      WHERE role = 'berufstrainer'
      ORDER BY COALESCE(display_name, username)`
  );

  return result.rows.map(function(row) {
    return { id: row.id, name: row.display_name || row.username };
  });
}

// The roles the database itself allows, in their declared order. Read from the
// user_role enum rather than hardcoded, so the dropdown in the admin dashboard
// cannot drift away from what an INSERT will actually accept.
async function listRoles() {
  var result = await db.query('SELECT unnest(enum_range(NULL::user_role))::text AS role');

  return result.rows.map(function(row) { return row.role; });
}

// Looks an account up by either of the two things a person can type into the
// login form. Matching on both columns at once is safe because they cannot
// collide: users_username_not_email forbids '@' in a username, so an input
// either looks like an address and can only match `email`, or does not and can
// only match `username`. At most one row ever comes back.
async function findByLogin(login) {
  var result = await db.query(
    `SELECT id, username, email, password_hash, display_name, role
       FROM users
      WHERE lower(username) = lower($1) OR lower(email) = lower($1)`,
    [login.trim()]
  );

  return result.rows[0] || null;
}

// `login` is a username or an e-mail address — the form does not ask which.
async function authenticate(login, password) {
  if (typeof login !== 'string' || typeof password !== 'string') {
    verifyPassword('', DUMMY_HASH);
    return null;
  }

  var user = await findByLogin(login);
  if (!user) {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }

  return verifyPassword(password, user.password_hash) ? publicUser(user) : null;
}

// Gate for any API route that needs a signed-in user. It answers 401 rather
// than redirecting — the React app owns navigation and turns this into a trip
// to /login, remembering where the visitor was headed.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();

  res.status(401).json({ error: { message: 'Nicht angemeldet.' } });
}

// Gate for routes only an admin may reach. Runs after requireAuth, and answers
// 403 (signed in, but not allowed) rather than 401 (not signed in), so the
// client can tell "log in" apart from "you are not an admin".
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();

  res.status(403).json({ error: { message: 'Nur für Administratoren.' } });
}

module.exports = {
  upsertUser: upsertUser,
  createUser: createUser,
  deleteUser: deleteUser,
  setPassword: setPassword,
  listUsers: listUsers,
  listRoles: listRoles,
  listBerufstrainer: listBerufstrainer,
  authenticate: authenticate,
  requireAuth: requireAuth,
  requireAdmin: requireAdmin
};
