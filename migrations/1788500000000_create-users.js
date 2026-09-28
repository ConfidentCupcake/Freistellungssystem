/* eslint-disable camelcase */

exports.up = function(pgm) {
  pgm.sql(`
    -- The list of roles lives here, in the database, rather than in a CHECK
    -- constraint or a JS constant: the admin dashboard reads it back with
    -- enum_range() to fill its dropdown, so adding a role is a one-line change
    -- here (or an ALTER TYPE ... ADD VALUE) and needs no application change.
    CREATE TYPE user_role AS ENUM ('admin', 'berufstrainer', 'teilnehmer');

    CREATE TABLE users (
      id            serial PRIMARY KEY,
      username      text NOT NULL,
      password_hash text NOT NULL,
      display_name  text,
      role          user_role NOT NULL DEFAULT 'teilnehmer',
      created_at    timestamptz NOT NULL DEFAULT now(),

      -- id alone is already unique; this pair exists so freistellungen can point
      -- a foreign key at (id, role) and thereby demand that the assigned
      -- Berufstrainer really carries that role.
      CONSTRAINT users_id_role_key UNIQUE (id, role)
    );

    -- Logins are case-insensitive (lib/auth.js looks up on lower(username)),
    -- so uniqueness has to be too, while the stored spelling is preserved.
    CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

    -- A role is decided once, when the account is created, and never changes
    -- afterwards: create a new account instead. Enforced here rather than in JS
    -- so no route, script or psql session can quietly promote somebody.
    CREATE FUNCTION users_role_is_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'role cannot be changed after the user is created'
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER users_role_immutable
      BEFORE UPDATE OF role ON users
      FOR EACH ROW
      WHEN (NEW.role IS DISTINCT FROM OLD.role)
      EXECUTE FUNCTION users_role_is_immutable();
  `);
};

exports.down = function(pgm) {
  // The trigger goes with the table; the function and the type do not.
  pgm.sql(`
    DROP TABLE users;
    DROP FUNCTION users_role_is_immutable();
    DROP TYPE user_role;
  `);
};
