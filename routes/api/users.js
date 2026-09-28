var express = require('express');
var auth = require('../../lib/auth');

var router = express.Router();

/* The whole router is admin-only; see the mount in app.js. Express 5 forwards a
 * rejected promise to the error handler by itself, so none of these need a
 * try/catch — the errors lib/auth.js throws already carry a `status`. */

/* GET users listing. */
router.get('/', async function(req, res, next) {
  res.json({ users: await auth.listUsers() });
});

/* GET the roles the database accepts, for the dashboard's dropdown. Declared
 * above '/:id'-style routes would matter if any existed — keep it that way. */
router.get('/roles', async function(req, res, next) {
  res.json({ roles: await auth.listRoles() });
});

/* POST a new account. The e-mail address is optional; without one the account
 * can only sign in by username. */
router.post('/', async function(req, res, next) {
  var user = await auth.createUser(
    req.body.username,
    req.body.password,
    req.body.role,
    req.body.email
  );

  res.status(201).json({ user: user });
});

/* PUT a new password. The acting admin's session id is handed down so their own
 * session survives when they change their own password. */
router.put('/:id/password', async function(req, res, next) {
  await auth.setPassword(req.params.id, req.body.password, req.sessionID);

  res.status(204).end();
});

/* DELETE an account. Declared after '/roles', so that literal path is never
 * taken for an id. */
router.delete('/:id', async function(req, res, next) {
  await auth.deleteUser(req.params.id, req.session.user.id);

  res.status(204).end();
});

module.exports = router;
