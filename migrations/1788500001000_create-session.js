/* eslint-disable camelcase */

/*
 * Table layout required by connect-pg-simple. Created here rather than letting
 * the store build it at boot (`createTableIfMissing`), so the schema is under
 * migration control like everything else.
 */

exports.up = function(pgm) {
  pgm.sql(`
    CREATE TABLE session (
      sid    varchar NOT NULL COLLATE "default" PRIMARY KEY,
      sess   json NOT NULL,
      expire timestamp(6) NOT NULL
    );

    -- The store sweeps expired rows by this column.
    CREATE INDEX session_expire_idx ON session (expire);
  `);
};

exports.down = function(pgm) {
  pgm.sql('DROP TABLE session;');
};
