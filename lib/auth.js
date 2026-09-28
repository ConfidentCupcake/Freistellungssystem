var crypto = require('crypto');

var db = require('./db');


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

var DUMMY_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    displayName: row.display_name,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    trainingArea: row.training_area || null,
    role: row.role,
    assignedBerufstrainerId: row.assigned_berufstrainer_id || null,
    createdAt: row.created_at
  };
}

function normalizeEmail(email) {
  email = String(email == null ? '' : email).trim();
  if (!email) return null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, 'Das ist keine gültige E-Mail-Adresse.');
  }

  return email;
}

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

function personalDetails(details) {
  details = details || {};
  var firstName = String(details.firstName == null ? '' : details.firstName).trim();
  var lastName = String(details.lastName == null ? '' : details.lastName).trim();
  var trainingArea = String(details.trainingArea == null ? '' : details.trainingArea).trim();
  if (!firstName || !lastName || !trainingArea) {
    throw httpError(400, 'Vorname, Nachname und Ausbildungsbereich sind erforderlich.');
  }
  if (firstName.length > 100 || lastName.length > 100 || trainingArea.length > 150) {
    throw httpError(400, 'Stammdaten sind zu lang.');
  }
  return { firstName: firstName, lastName: lastName, trainingArea: trainingArea };
}

async function createUser(username, password, role, email, assignedBerufstrainerId, details) {
  username = String(username == null ? '' : username).trim();
  email = normalizeEmail(email);
  // Die Trainer-Neuanlage übergibt Stammdaten. Das Adminformular übergibt
  // keine; dort ergänzt der Teilnehmer die Felder später selbst.
  var profile = details == null ? null : personalDetails(details);

  if (!username) throw httpError(400, 'Benutzername darf nicht leer sein.');
  if (!password) throw httpError(400, 'Passwort darf nicht leer sein.');
  if (!role) throw httpError(400, 'Bitte eine Rolle wählen.');
  // Bei Neuanlagen ist die Zuordnung zwingend. Für alte Konten erlaubt die
  // Migration NULL, damit sie nachträglich durch den Admin betreut werden können.
  if (role === 'teilnehmer') {
    assignedBerufstrainerId = Number(assignedBerufstrainerId);
    if (!Number.isInteger(assignedBerufstrainerId) || assignedBerufstrainerId <= 0) {
      throw httpError(400, 'Bitte einen Berufstrainer zuweisen.');
    }
  } else if (assignedBerufstrainerId != null && assignedBerufstrainerId !== '') {
    throw httpError(400, 'Nur Teilnehmer können einem Berufstrainer zugewiesen werden.');
  }
  if (username.indexOf('@') !== -1) {
    throw httpError(400, 'Der Benutzername darf kein @ enthalten — dafür ist das E-Mail-Feld da.');
  }

  try {
    var result = await db.query(
      `INSERT INTO users (username, password_hash, role, email, assigned_berufstrainer_id,
                          first_name, last_name, training_area, display_name)
            VALUES ($1, $2, $3::user_role, $4, $5, $6, $7, $8, $9)
        RETURNING id, username, email, display_name, role, created_at,
                  assigned_berufstrainer_id, first_name, last_name, training_area`,
      [username, hashPassword(password), role, email,
        role === 'teilnehmer' ? assignedBerufstrainerId : null,
        profile?.firstName || null, profile?.lastName || null, profile?.trainingArea || null,
        profile ? profile.firstName + ' ' + profile.lastName : null]
    );

    return publicUser(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'users_email_lower_key') {
        throw httpError(409, 'Diese E-Mail-Adresse wird bereits verwendet.');
      }
      throw httpError(409, 'Diesen Benutzernamen gibt es bereits.');
    }
    if (err.code === '22P02') throw httpError(400, 'Unbekannte Rolle.');
    if (err.code === '23503') throw httpError(400, 'Der gewählte Berufstrainer ist ungültig.');
    throw err;
  }
}

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

/* Der Wechsel des eigenen Passworts, und damit ausdrücklich nicht setPassword:
 * Dort ist das Gate requireAdmin, und wer es passiert, hat das fremde Konto
 * nicht in der Hand — ein altes Passwort abzufragen, das er nicht kennen kann,
 * wäre dort sinnlos. Hier ist der Aufrufer das Konto, und ein unbeaufsichtigt
 * offener Browser soll nicht genügen, um es zu übernehmen. Deshalb das alte
 * Passwort als Pflichtfeld.
 *
 * Geschrieben wird über setPassword, damit es bei einer Regel bleibt, welche
 * Sessions ein neues Passwort beendet: alle des Kontos außer der eigenen. */
async function changeOwnPassword(id, currentPassword, newPassword, keepSid) {
  id = Number(id);
  if (!Number.isInteger(id)) throw httpError(400, 'Ungültige Benutzer-ID.');

  if (typeof currentPassword !== 'string' || !currentPassword) {
    throw httpError(400, 'Bitte geben Sie Ihr aktuelles Passwort ein.');
  }
  if (typeof newPassword !== 'string' || !newPassword) {
    throw httpError(400, 'Bitte geben Sie ein neues Passwort ein.');
  }

  var result = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
  var row = result.rows[0];
  // Die Session zeigt auf ein Konto, das es nicht mehr gibt — gelöscht, während
  // dieser Tab offen stand.
  if (!row) throw httpError(404, 'Diesen Benutzer gibt es nicht.');

  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw httpError(403, 'Das aktuelle Passwort ist falsch.');
  }
  if (currentPassword === newPassword) {
    throw httpError(400, 'Das neue Passwort muss sich vom aktuellen unterscheiden.');
  }

  await setPassword(id, newPassword, keepSid);
}

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

async function listUsers() {
  var result = await db.query(
    `SELECT id, username, email, display_name, role, created_at,
            assigned_berufstrainer_id, first_name, last_name, training_area
       FROM users ORDER BY id`
  );

  return result.rows.map(publicUser);
}

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

// Der Trainer sieht ausschließlich seine aktuell zugeordneten Teilnehmer.
async function listTeilnehmerForTrainer(trainerId) {
  var result = await db.query(
    `SELECT id, username, email, display_name, role, created_at,
            assigned_berufstrainer_id, first_name, last_name, training_area
       FROM users WHERE role = 'teilnehmer' AND assigned_berufstrainer_id = $1
      ORDER BY COALESCE(display_name, username)`, [trainerId]
  );
  return result.rows.map(publicUser);
}

async function updateOwnProfile(userId, input) {
  var profile = personalDetails(input);
  var result = await db.query(
    `UPDATE users SET first_name = $2, last_name = $3, training_area = $4,
                      display_name = $2 || ' ' || $3
      WHERE id = $1 AND role = 'teilnehmer'
      RETURNING id, username, email, display_name, role, created_at,
                assigned_berufstrainer_id, first_name, last_name, training_area`,
    [userId, profile.firstName, profile.lastName, profile.trainingArea]
  );
  if (!result.rowCount) throw httpError(404, 'Teilnehmer nicht gefunden.');
  return publicUser(result.rows[0]);
}

// Zuordnung und Antragshistorie wechseln gemeinsam. Eine Sperre auf der
// Teilnehmerzeile serialisiert Transfers mit neuen Anträgen und Entscheidungen.
async function assignTeilnehmer(teilnehmerId, targetId, actor) {
  teilnehmerId = Number(teilnehmerId);
  targetId = Number(targetId);
  if (!Number.isInteger(teilnehmerId) || !Number.isInteger(targetId) || targetId <= 0) {
    throw httpError(400, 'Ungültiger Teilnehmer oder Berufstrainer.');
  }
  var client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    var result = await client.query(
      `SELECT id, role, assigned_berufstrainer_id FROM users WHERE id = $1 FOR UPDATE`,
      [teilnehmerId]
    );
    var row = result.rows[0];
    if (!row || row.role !== 'teilnehmer') throw httpError(404, 'Teilnehmer nicht gefunden.');
    if (actor.role !== 'admin' && row.assigned_berufstrainer_id !== actor.id) {
      throw httpError(403, 'Nur eigene Teilnehmer dürfen übertragen werden.');
    }
    if (row.assigned_berufstrainer_id === targetId) {
      throw httpError(409, 'Der Teilnehmer ist diesem Berufstrainer bereits zugewiesen.');
    }
    var target = await client.query('SELECT id FROM users WHERE id = $1 AND role = $2',
      [targetId, 'berufstrainer']);
    if (!target.rowCount) throw httpError(400, 'Zielkonto ist kein Berufstrainer.');
    // Abgelehnte Anträge sind endgültig erledigt; alle anderen müssen vor dem
    // Wechsel entweder abgeschlossen oder abgelehnt sein.
    // Die erste Zuordnung alter Konten ist keine Übertragung: Sie muss auch
    // bei offenen Altanträgen möglich sein, sonst könnte niemand sie bearbeiten.
    if (row.assigned_berufstrainer_id != null) {
      var pending = await client.query(
        `SELECT id FROM freistellungen WHERE user_id = $1
          AND status NOT IN ('abgelehnt', 'geschlossen', 'storniert') LIMIT 1`, [teilnehmerId]
      );
      if (pending.rowCount) throw httpError(409, 'Vor dem Transfer alle offenen Freistellungen abschließen.');
    }
    await client.query('UPDATE users SET assigned_berufstrainer_id = $2 WHERE id = $1',
      [teilnehmerId, targetId]);
    await client.query('UPDATE freistellungen SET assigned_berufstrainer_id = $2 WHERE user_id = $1',
      [teilnehmerId, targetId]);
    if (row.assigned_berufstrainer_id != null) {
      await client.query(
        `INSERT INTO teilnehmer_transfers
          (teilnehmer_id, from_berufstrainer_id, to_berufstrainer_id, transferred_by)
         VALUES ($1, $2, $3, $4)`,
        [teilnehmerId, row.assigned_berufstrainer_id, targetId, actor.id]
      );
    }
    await client.query('COMMIT');
    return { id: teilnehmerId, assignedBerufstrainerId: targetId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listRoles() {
  var result = await db.query('SELECT unnest(enum_range(NULL::user_role))::text AS role');

  return result.rows.map(function(row) { return row.role; });
}

async function findByLogin(login) {
  var result = await db.query(
    `SELECT id, username, email, password_hash, display_name, role,
            first_name, last_name, training_area, assigned_berufstrainer_id
       FROM users
      WHERE lower(username) = lower($1) OR lower(email) = lower($1)`,
    [login.trim()]
  );

  return result.rows[0] || null;
}

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

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();

  res.status(401).json({ error: { message: 'Nicht angemeldet.' } });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();

  res.status(403).json({ error: { message: 'Nur für Administratoren.' } });
}

function requireTrainer(req, res, next) {
  if (req.session?.user?.role === 'berufstrainer') return next();
  res.status(403).json({ error: { message: 'Nur für Berufstrainer.' } });
}

module.exports = {
  upsertUser: upsertUser,
  createUser: createUser,
  deleteUser: deleteUser,
  setPassword: setPassword,
  changeOwnPassword: changeOwnPassword,
  listUsers: listUsers,
  listRoles: listRoles,
  listBerufstrainer: listBerufstrainer,
  listTeilnehmerForTrainer: listTeilnehmerForTrainer,
  updateOwnProfile: updateOwnProfile,
  assignTeilnehmer: assignTeilnehmer,
  authenticate: authenticate,
  requireAuth: requireAuth,
  requireAdmin: requireAdmin,
  requireTrainer: requireTrainer
};
