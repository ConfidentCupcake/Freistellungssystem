/* eslint-disable camelcase */

exports.up = function(pgm) {
  pgm.sql(`
    -- Lets a gist index mix an equality column (user_id) with a range column,
    -- which the overlap constraint below needs.
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    CREATE TABLE freistellungen (
      id            serial PRIMARY KEY,
      user_id       integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      start_date    timestamptz NOT NULL,
      end_date      timestamptz NOT NULL,
      kind          text NOT NULL,
      reason        text,
      status        text NOT NULL DEFAULT 'offen'
                      CHECK (status IN ('offen', 'genehmigt', 'abgelehnt', 'geschlossen')),
      requested_at  timestamptz NOT NULL DEFAULT now(),
      decided_by    integer REFERENCES users (id) ON DELETE SET NULL,
      decided_at    timestamptz,
      decision_note text,

      -- The Berufstrainer looking after this release; NULL until one is assigned.
      assigned_berufstrainer_id   integer,

      -- Carries the constant 'berufstrainer' so the composite foreign key below
      -- can insist the assigned user actually holds that role. Never set it by
      -- hand — the default and the CHECK are the whole point.
      assigned_berufstrainer_role user_role NOT NULL DEFAULT 'berufstrainer'
                      CHECK (assigned_berufstrainer_role = 'berufstrainer'),

      -- MATCH SIMPLE: with assigned_berufstrainer_id NULL the pair is not
      -- checked at all, so an unassigned release stays legal. ON UPDATE never
      -- fires in practice — users.role is immutable by trigger — but RESTRICT
      -- states the intent and keeps a stray CASCADE off the table.
      CONSTRAINT freistellungen_assigned_berufstrainer_fkey
        FOREIGN KEY (assigned_berufstrainer_id, assigned_berufstrainer_role)
        REFERENCES users (id, role) ON DELETE RESTRICT ON UPDATE RESTRICT,

      -- Strictly greater, not >=: an equal pair would produce an empty range,
      -- and empty ranges never overlap, so they would slip past the check below.
      CONSTRAINT freistellungen_dates_ordered CHECK (end_date > start_date),

      -- start_date is inclusive, end_date exclusive, as far as the application
      -- is concerned; this derived range is what the overlap check indexes. '[)'
      -- lets one release end at the exact instant the next one starts. A whole
      -- released day is therefore 00:00 up to 00:00 of the following day.
      period tstzrange GENERATED ALWAYS AS (tstzrange(start_date, end_date, '[)')) STORED,

      -- The core domain rule: one person cannot hold two live releases over the
      -- same stretch of time. Enforced by the database, so two concurrent
      -- submissions cannot race past an application-level check. Rejected
      -- requests are exempt, since they no longer block anything.
      CONSTRAINT freistellungen_no_overlap
        EXCLUDE USING gist (user_id WITH =, period WITH &&)
        WHERE (status <> 'abgelehnt')
    );

    CREATE INDEX freistellungen_user_id_idx ON freistellungen (user_id);
    CREATE INDEX freistellungen_status_idx ON freistellungen (status);
    CREATE INDEX freistellungen_assigned_berufstrainer_idx
      ON freistellungen (assigned_berufstrainer_id);
  `);
};

exports.down = function(pgm) {
  pgm.sql('DROP TABLE freistellungen;');
};
