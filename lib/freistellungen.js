var db = require('./db');

/*
 * Everything that reads or writes the `freistellungen` table (see migrations/).
 *
 * The dates are timestamptz and the interval is half-open: start_date is
 * inclusive, end_date exclusive, so a whole released day runs from 00:00 to
 * 00:00 of the following day. The database owns the overlap rule
 * (freistellungen_no_overlap) — two concurrent submissions cannot race past it,
 * which is why nothing here tries to check for a clash before inserting.
 */

// Requests submitted from the Teilnehmer dashboard are all of one kind; the
// column is NOT NULL, and there is no second kind to choose from yet.
var DEFAULT_KIND = 'freistellung';

// Kept in step with the maxLength on the Sonstiges dialog's textarea in
// client/src/pages/Teilnehmer.jsx.
var REASON_MAX = 300;

// What goes out to the client. The Berufstrainer's name comes from a join and
// is undefined on the rows that do not select it; JSON drops it either way.
function publicFreistellung(row) {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    kind: row.kind,
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    assignedBerufstrainer: row.assigned_berufstrainer || null
  };
}

function httpError(status, message) {
  var err = new Error(message);
  err.status = status;
  return err;
}

// The browser sends an ISO string built from a datetime-local field, so the
// offset is already baked in. Anything unparseable is the caller's mistake.
function parseDate(value, label) {
  var date = new Date(value == null ? '' : value);
  if (Number.isNaN(date.getTime())) {
    throw httpError(400, label + ' ist kein gültiger Zeitpunkt.');
  }

  return date;
}

// The assignee is optional — the column is NULL until somebody is put on the
// case, and the form offers "noch nicht zugewiesen". Only the shape is checked
// here; that the id really belongs to a Berufstrainer is the composite foreign
// key's job, and its rejection is translated below.
function parseAssignee(value) {
  if (value == null || value === '') return null;

  var id = Number(value);
  if (!Number.isInteger(id)) throw httpError(400, 'Ungültiger Berufstrainer.');

  return id;
}

// One person's own releases, newest first. The assignee is joined in so the
// list can name the Berufstrainer instead of showing a bare id.
async function listForUser(userId) {
  var result = await db.query(
    `SELECT f.id, f.start_date, f.end_date, f.kind, f.reason, f.status,
            f.requested_at, f.decided_at, f.decision_note,
            COALESCE(t.display_name, t.username) AS assigned_berufstrainer
       FROM freistellungen f
       LEFT JOIN users t ON t.id = f.assigned_berufstrainer_id
      WHERE f.user_id = $1
      ORDER BY f.start_date DESC, f.id DESC`,
    [userId]
  );

  return result.rows.map(publicFreistellung);
}

// Files a new request for `userId`. It always starts as 'offen': the status
// column has that default and nothing here may set one.
//
// The ordering check is done before the INSERT on purpose. `period` is a
// generated column, so it is computed *before* the CHECK constraints run — an
// end before the start fails with Postgres's range-constructor error rather
// than the named freistellungen_dates_ordered check, and that message is not
// one to show anybody.
async function createForUser(userId, input) {
  input = input || {};

  var startDate = parseDate(input.startDate, 'Der Beginn');
  var endDate = parseDate(input.endDate, 'Das Ende');
  var reason = String(input.reason == null ? '' : input.reason).trim();
  var assignee = parseAssignee(input.assignedBerufstrainerId);

  if (endDate <= startDate) {
    throw httpError(400, 'Das Ende muss nach dem Beginn liegen.');
  }
  // The column is nullable, but a request without a stated reason is not
  // something a Berufstrainer can decide on.
  if (!reason) {
    throw httpError(400, 'Bitte geben Sie einen Grund an.');
  }
  // `reason` is an unbounded text column, and with the Sonstiges dialog it
  // carries whatever somebody typed. The form stops at 300 characters; this
  // makes that the actual limit rather than a suggestion to well-behaved
  // clients.
  if (reason.length > REASON_MAX) {
    throw httpError(400, 'Der Grund ist zu lang (höchstens ' + REASON_MAX + ' Zeichen).');
  }

  try {
    // assigned_berufstrainer_role is never written by hand: it defaults to the
    // constant the composite foreign key needs, and a CHECK pins it there.
    var result = await db.query(
      `INSERT INTO freistellungen
              (user_id, start_date, end_date, kind, reason, assigned_berufstrainer_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, start_date, end_date, kind, reason, status,
                  requested_at, decided_at, decision_note`,
      [userId, startDate, endDate, DEFAULT_KIND, reason, assignee]
    );

    return publicFreistellung(result.rows[0]);
  } catch (err) {
    // exclusion_violation: freistellungen_no_overlap. A rejected request is
    // exempt from that constraint, so the clash is always with a live one.
    if (err.code === '23P01') {
      throw httpError(409, 'In diesem Zeitraum haben Sie bereits eine Freistellung.');
    }
    // The composite key refuses an id that is not a Berufstrainer just as
    // firmly as one that is nobody at all; from here the two are the same
    // mistake. Other foreign keys on this table are not the caller's doing.
    if (err.code === '23503' && err.constraint === 'freistellungen_assigned_berufstrainer_fkey') {
      throw httpError(400, 'Diesen Berufstrainer gibt es nicht.');
    }
    throw err;
  }
}

module.exports = {
  listForUser: listForUser,
  createForUser: createForUser
};
