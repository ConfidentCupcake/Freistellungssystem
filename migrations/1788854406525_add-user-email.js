/* eslint-disable camelcase */

exports.up = function(pgm) {
  pgm.sql(`
    -- Nullable: the accounts that already exist (including the seeded admin)
    -- have no address, and there is nothing sensible to backfill them with.
    -- They keep signing in by username.
    ALTER TABLE users ADD COLUMN email text;

    -- Same deal as the username: matching is case-insensitive (lib/auth.js
    -- looks up on lower(email)), so uniqueness has to be too, while whatever
    -- capitalisation the admin typed is preserved. A unique index lets any
    -- number of rows stay NULL, which is what makes the column optional.
    CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

    -- A loose shape check only — the real validation and the German error
    -- message live in lib/auth.js. This is the backstop that stops a psql
    -- session or a future script writing something that is plainly not an
    -- address. Rejects surrounding whitespace as well, so lower(email) in the
    -- lookup is the only normalisation the login path has to do.
    ALTER TABLE users ADD CONSTRAINT users_email_shape
      CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$');

    -- Login accepts either column, so the two namespaces must not be able to
    -- overlap: without this, one account's username could be another
    -- account's address and a single input would match two rows. Forbidding
    -- '@' in a username makes them disjoint by construction, which is why the
    -- lookup can simply OR the two columns together and take the one row.
    ALTER TABLE users ADD CONSTRAINT users_username_not_email
      CHECK (username NOT LIKE '%@%');
  `);
};

exports.down = function(pgm) {
  pgm.sql(`
    ALTER TABLE users DROP CONSTRAINT users_username_not_email;
    ALTER TABLE users DROP CONSTRAINT users_email_shape;
    DROP INDEX users_email_lower_key;
    ALTER TABLE users DROP COLUMN email;
  `);
};
