/* eslint-disable camelcase */

exports.up = function(pgm) {
  pgm.sql(`
    -- Admins können vorhandene Teilnehmer ohne Stammdaten anlegen. Trainer
    -- erfassen diese Angaben bei der Neuanlage; Teilnehmer dürfen sie ergänzen.
    ALTER TABLE users ADD COLUMN first_name text;
    ALTER TABLE users ADD COLUMN last_name text;
    ALTER TABLE users ADD COLUMN training_area text;

    -- Stornierungen bleiben als nachvollziehbare Einträge in der Historie.
    ALTER TABLE freistellungen DROP CONSTRAINT freistellungen_status_check;
    ALTER TABLE freistellungen ADD CONSTRAINT freistellungen_status_check
      CHECK (status IN ('offen', 'genehmigt', 'abgelehnt', 'geschlossen', 'storniert'));
    ALTER TABLE freistellungen ADD COLUMN cancellation_reason text;
    ALTER TABLE freistellungen ADD COLUMN cancelled_at timestamptz;
    ALTER TABLE freistellungen ADD COLUMN cancelled_by integer REFERENCES users (id) ON DELETE SET NULL;
    ALTER TABLE freistellungen ADD CONSTRAINT freistellungen_cancellation_reason_required
      CHECK (status <> 'storniert' OR
        (cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason)) > 0
         AND cancelled_at IS NOT NULL));

    -- Eine stornierte Freistellung darf einen neuen Antrag zur selben Zeit
    -- nicht blockieren. Die Exclusion-Regel bleibt in PostgreSQL gegen Rennen.
    ALTER TABLE freistellungen DROP CONSTRAINT freistellungen_no_overlap;
    ALTER TABLE freistellungen ADD CONSTRAINT freistellungen_no_overlap
      EXCLUDE USING gist (user_id WITH =, period WITH &&)
      WHERE (status NOT IN ('abgelehnt', 'storniert'));
  `);
};

exports.down = function(pgm) {
  pgm.sql(`
    -- Vor einem Rollback dürfen keine stornieren Einträge bestehen, da der
    -- alte Status-Check diesen Zustand nicht kennt.
    ALTER TABLE freistellungen DROP CONSTRAINT freistellungen_no_overlap;
    ALTER TABLE freistellungen ADD CONSTRAINT freistellungen_no_overlap
      EXCLUDE USING gist (user_id WITH =, period WITH &&)
      WHERE (status <> 'abgelehnt');
    ALTER TABLE freistellungen DROP COLUMN cancelled_by;
    ALTER TABLE freistellungen DROP CONSTRAINT freistellungen_cancellation_reason_required;
    ALTER TABLE freistellungen DROP COLUMN cancelled_at;
    ALTER TABLE freistellungen DROP COLUMN cancellation_reason;
    ALTER TABLE freistellungen DROP CONSTRAINT freistellungen_status_check;
    ALTER TABLE freistellungen ADD CONSTRAINT freistellungen_status_check
      CHECK (status IN ('offen', 'genehmigt', 'abgelehnt', 'geschlossen'));
    ALTER TABLE users DROP COLUMN training_area;
    ALTER TABLE users DROP COLUMN last_name;
    ALTER TABLE users DROP COLUMN first_name;
  `);
};
