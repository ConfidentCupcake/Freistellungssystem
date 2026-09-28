var db = require('./db');

var REASON_MAX = 300;
var FIELDS = `f.id, f.user_id, f.start_date, f.end_date, f.kind, f.reason,
  f.status, f.requested_at, f.decided_by, f.decided_at, f.decision_note,
  f.on_way_at, f.reported_back_at, f.closed_at, f.closed_by,
  f.cancellation_reason, f.cancelled_at, f.cancelled_by,
  f.assigned_berufstrainer_id,
  COALESCE(t.display_name, t.username) AS assigned_berufstrainer,
  COALESCE(u.display_name, u.username) AS teilnehmer_name`;
var JOINS = `FROM freistellungen f
  JOIN users u ON u.id = f.user_id
  LEFT JOIN users t ON t.id = f.assigned_berufstrainer_id`;

function httpError(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

// Genehmigt bleibt der gespeicherte Status. Die Ansicht wechselt zur Startzeit
// automatisch nach „bei Termin“ und nach der Rückmeldung nach „zurück“.
function phase(row, now) {
  if (row.status !== 'genehmigt') return row.status;
  if (row.reported_back_at) return 'zurueck';
  return row.on_way_at || new Date(row.start_date) <= now ? 'bei_termin' : 'genehmigt';
}

function publicFreistellung(row) {
  return {
    id: row.id,
    userId: row.user_id,
    teilnehmerName: row.teilnehmer_name,
    startDate: row.start_date,
    endDate: row.end_date,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    phase: phase(row, new Date()),
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    onWayAt: row.on_way_at,
    reportedBackAt: row.reported_back_at,
    closedAt: row.closed_at,
    cancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at,
    assignedBerufstrainer: row.assigned_berufstrainer || null
  };
}

async function listForUser(userId) {
  var result = await db.query(
    `SELECT ${FIELDS} ${JOINS} WHERE f.user_id = $1
     ORDER BY f.start_date DESC, f.id DESC`, [userId]
  );
  return result.rows.map(publicFreistellung);
}

// Die aktuelle Teilnehmerzuordnung bestimmt die Sichtbarkeit der gesamten
// Historie. Der bisherige Trainer verliert sie unmittelbar nach dem Transfer.
async function listForTrainer(trainerId) {
  var result = await db.query(
    `SELECT ${FIELDS} ${JOINS}
     WHERE u.assigned_berufstrainer_id = $1 AND u.role = 'teilnehmer'
     ORDER BY f.start_date DESC, f.id DESC`, [trainerId]
  );
  return result.rows.map(publicFreistellung);
}

function parseDate(value, label) {
  var date = new Date(value == null ? '' : value);
  if (Number.isNaN(date.getTime())) throw httpError(400, label + ' ist kein gültiger Zeitpunkt.');
  return date;
}

async function createForUser(userId, input) {
  input = input || {};
  var startDate = parseDate(input.startDate, 'Der Beginn');
  var endDate = parseDate(input.endDate, 'Das Ende');
  var reason = String(input.reason == null ? '' : input.reason).trim();
  if (endDate <= startDate) throw httpError(400, 'Das Ende muss nach dem Beginn liegen.');
  if (!reason) throw httpError(400, 'Bitte geben Sie einen Grund an.');
  if (reason.length > REASON_MAX) throw httpError(400, 'Der Grund ist zu lang (höchstens 300 Zeichen).');

  var client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Dieselbe Zeilensperre benutzt auch der Transfer. Somit kann zwischen
    // Zuordnung und INSERT kein Trainerwechsel stattfinden.
    var owner = await client.query(
      'SELECT role, assigned_berufstrainer_id FROM users WHERE id = $1 FOR UPDATE', [userId]
    );
    var user = owner.rows[0];
    if (!user || user.role !== 'teilnehmer') throw httpError(403, 'Nur Teilnehmer dürfen Freistellungen beantragen.');
    if (!user.assigned_berufstrainer_id) {
      throw httpError(409, 'Noch kein Berufstrainer zugewiesen. Bitte die Administration kontaktieren.');
    }
    // Die Trainer-ID aus dem Browser wird grundsätzlich ignoriert. Der
    // zugewiesene Trainer stammt ausschließlich aus dem Benutzerkonto.
    var result = await client.query(
      `INSERT INTO freistellungen
        (user_id, start_date, end_date, kind, reason, assigned_berufstrainer_id)
       VALUES ($1, $2, $3, 'freistellung', $4, $5) RETURNING id`,
      [userId, startDate, endDate, reason, user.assigned_berufstrainer_id]
    );
    var created = await client.query(
      `SELECT ${FIELDS} ${JOINS} WHERE f.id = $1`, [result.rows[0].id]
    );
    await client.query('COMMIT');
    return publicFreistellung(created.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23P01') throw httpError(409, 'In diesem Zeitraum haben Sie bereits eine Freistellung.');
    throw err;
  } finally {
    client.release();
  }
}

// Entscheidungen und Rückmeldungen sperren ebenfalls den Teilnehmer. Dadurch
// prüft ein gleichzeitiger Transfer den endgültigen Antragszustand.
async function withRequest(id, actorId, role, action) {
  id = Number(id);
  if (!Number.isInteger(id)) throw httpError(400, 'Ungültige Freistellungs-ID.');
  var client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    var found = await client.query('SELECT user_id FROM freistellungen WHERE id = $1', [id]);
    if (!found.rowCount) throw httpError(404, 'Freistellung nicht gefunden.');
    var owner = await client.query(
      'SELECT id, assigned_berufstrainer_id FROM users WHERE id = $1 FOR UPDATE',
      [found.rows[0].user_id]
    );
    var allowed = role === 'teilnehmer'
      ? owner.rows[0]?.id === actorId
      : owner.rows[0]?.assigned_berufstrainer_id === actorId;
    if (!allowed) throw httpError(403, 'Keine Berechtigung für diese Freistellung.');
    var locked = await client.query(
      'SELECT * FROM freistellungen WHERE id = $1 FOR UPDATE', [id]
    );
    await action(client, locked.rows[0]);
    var result = await client.query(`SELECT ${FIELDS} ${JOINS} WHERE f.id = $1`, [id]);
    await client.query('COMMIT');
    return publicFreistellung(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function decide(id, trainerId, decision, note) {
  if (!['genehmigt', 'abgelehnt'].includes(decision)) {
    throw httpError(400, 'Entscheidung muss genehmigt oder abgelehnt sein.');
  }
  note = String(note == null ? '' : note).trim();
  if (note.length > 1000) throw httpError(400, 'Anmerkung zu lang (höchstens 1000 Zeichen).');
  return withRequest(id, trainerId, 'berufstrainer', async (client, row) => {
    if (row.status !== 'offen') throw httpError(409, 'Dieser Antrag wurde bereits entschieden.');
    await client.query(
      `UPDATE freistellungen SET status = $2, decided_by = $3,
       decided_at = now(), decision_note = $4 WHERE id = $1`,
      [id, decision, trainerId, note || null]
    );
  });
}

async function reportBack(id, userId) {
  return withRequest(id, userId, 'teilnehmer', async (client, row) => {
    if (row.status !== 'genehmigt' || row.reported_back_at) {
      throw httpError(409, 'Rückmeldung für diese Freistellung nicht möglich.');
    }
    if (new Date(row.start_date) > new Date()) {
      throw httpError(409, 'Die Rückkehr kann erst nach Beginn des Termins gemeldet werden.');
    }
    await client.query('UPDATE freistellungen SET reported_back_at = now() WHERE id = $1', [id]);
  });
}

// Optionaler Hinweis vor dem Start: Die Freistellung erscheint dann bereits
// als „bei Termin“. Der Startzeitpunkt löst denselben Anzeigestatus automatisch aus.
async function markOnWay(id, userId) {
  return withRequest(id, userId, 'teilnehmer', async (client, row) => {
    if (row.status !== 'genehmigt' || row.on_way_at || row.reported_back_at) {
      throw httpError(409, 'Unterwegs-Meldung für diese Freistellung nicht möglich.');
    }
    await client.query('UPDATE freistellungen SET on_way_at = now() WHERE id = $1', [id]);
  });
}

async function close(id, trainerId) {
  return withRequest(id, trainerId, 'berufstrainer', async (client, row) => {
    if (row.status !== 'genehmigt' || !row.reported_back_at) {
      throw httpError(409, 'Abschluss erst nach der Rückmeldung des Teilnehmers möglich.');
    }
    await client.query(
      `UPDATE freistellungen SET status = 'geschlossen', closed_at = now(), closed_by = $2
       WHERE id = $1`, [id, trainerId]
    );
  });
}

// Eine Stornierung beendet einen offenen oder genehmigten Antrag, ohne dessen
// Verlauf zu löschen. Ein Grund ist Pflicht; die Exclusion-Regel gibt danach
// den Zeitraum für einen neu angesetzten Termin wieder frei.
async function cancel(id, trainerId, reason) {
  reason = String(reason == null ? '' : reason).trim();
  if (!reason) throw httpError(400, 'Bitte einen Grund für die Stornierung angeben.');
  if (reason.length > 500) throw httpError(400, 'Stornierungsgrund zu lang (höchstens 500 Zeichen).');
  return withRequest(id, trainerId, 'berufstrainer', async (client, row) => {
    if (!['offen', 'genehmigt'].includes(row.status)) {
      throw httpError(409, 'Nur offene oder genehmigte Freistellungen lassen sich stornieren.');
    }
    await client.query(
      `UPDATE freistellungen SET status = 'storniert', cancellation_reason = $2,
       cancelled_at = now(), cancelled_by = $3 WHERE id = $1`,
      [id, reason, trainerId]
    );
  });
}

module.exports = { listForUser, listForTrainer, createForUser, decide, markOnWay, reportBack, close, cancel };
