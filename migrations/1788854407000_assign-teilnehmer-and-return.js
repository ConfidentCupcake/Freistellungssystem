/* eslint-disable camelcase */

exports.up = function(pgm) {
  pgm.sql(`
    -- Bestandskonten bleiben zunächst ohne Zuordnung und müssen durch einen
    -- Administrator zugewiesen werden. Neue Konten prüft die API verpflichtend.
    ALTER TABLE users ADD COLUMN assigned_berufstrainer_id integer;
    ALTER TABLE users ADD COLUMN assigned_berufstrainer_role user_role
      NOT NULL DEFAULT 'berufstrainer'
      CHECK (assigned_berufstrainer_role = 'berufstrainer');
    ALTER TABLE users ADD CONSTRAINT users_assigned_berufstrainer_fkey
      FOREIGN KEY (assigned_berufstrainer_id, assigned_berufstrainer_role)
      REFERENCES users (id, role) ON DELETE RESTRICT;
    ALTER TABLE users ADD CONSTRAINT users_assignment_only_teilnehmer
      CHECK (role = 'teilnehmer' OR assigned_berufstrainer_id IS NULL);
    CREATE INDEX users_assigned_berufstrainer_idx ON users (assigned_berufstrainer_id);

    -- Der Teilnehmer meldet die Rückkehr; erst der Berufstrainer bestätigt
    -- danach den Abschluss. Beide Zeitpunkte bleiben getrennt nachvollziehbar.
    ALTER TABLE freistellungen ADD COLUMN reported_back_at timestamptz;
    ALTER TABLE freistellungen ADD COLUMN on_way_at timestamptz;
    ALTER TABLE freistellungen ADD COLUMN closed_at timestamptz;
    ALTER TABLE freistellungen ADD COLUMN closed_by integer REFERENCES users (id) ON DELETE SET NULL;

    -- Ein Transfer ändert den aktuellen Betreuer aller Anträge. Wer eine
    -- frühere Entscheidung getroffen hat, steht weiterhin in decided_by.
    CREATE TABLE teilnehmer_transfers (
      id bigserial PRIMARY KEY,
      teilnehmer_id integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      from_berufstrainer_id integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      to_berufstrainer_id integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      transferred_by integer NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
      transferred_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

exports.down = function(pgm) {
  pgm.sql(`
    DROP TABLE teilnehmer_transfers;
    ALTER TABLE freistellungen DROP COLUMN closed_by;
    ALTER TABLE freistellungen DROP COLUMN closed_at;
    ALTER TABLE freistellungen DROP COLUMN reported_back_at;
    ALTER TABLE freistellungen DROP COLUMN on_way_at;
    DROP INDEX users_assigned_berufstrainer_idx;
    ALTER TABLE users DROP CONSTRAINT users_assignment_only_teilnehmer;
    ALTER TABLE users DROP CONSTRAINT users_assigned_berufstrainer_fkey;
    ALTER TABLE users DROP COLUMN assigned_berufstrainer_role;
    ALTER TABLE users DROP COLUMN assigned_berufstrainer_id;
  `);
};
