var express = require('express');
var auth = require('../../lib/auth');

var router = express.Router();

/* GET the signed-in user, or null. The React app calls this on boot to decide
 * whether to show the login screen. */
router.get('/session', function(req, res, next) {
  res.json({ user: req.session.user || null });
});

/* POST credentials. `username` carries whatever was typed into the single
 * identifier field — a username or an e-mail address; authenticate() accepts
 * either. The field keeps its name so the wire format stays unchanged.
 *
 * Express 5 forwards a rejected promise to the error handler by itself, so the
 * database lookup needs no try/catch here. */
router.post('/login', async function(req, res, next) {
  var user = await auth.authenticate(req.body.username, req.body.password);
  if (!user) {
    return res.status(401).json({
      error: { message: 'Benutzername, E-Mail oder Passwort ist falsch.' }
    });
  }

  // New session id on login, so a session fixed before sign-in is useless.
  req.session.regenerate(function(err) {
    if (err) return next(err);

    req.session.user = user;
    req.session.save(function(err) {
      if (err) return next(err);
      res.json({ user: user });
    });
  });
});

/* PUT a new password for the signed-in user (204). The gate sits on the route,
 * not on the router: /api/auth is mounted without one, because /session and
 * /login have to be reachable before there is a session.
 *
 * The user id comes from the session and is never read from the body — that is
 * what keeps this from being an admin reset in disguise. Passing req.sessionID
 * through means every other session of the account is dropped while the caller
 * keeps the one they are clicking in. */
router.put('/password', auth.requireAuth, async function(req, res, next) {
  await auth.changeOwnPassword(
    req.session.user.id,
    req.body.currentPassword,
    req.body.newPassword,
    req.sessionID
  );

  res.status(204).end();
});

/* POST logout. */
router.post('/logout', function(req, res, next) {
  req.session.destroy(function(err) {
    if (err) return next(err);
    res.clearCookie('sid');
    res.json({ user: null });
  });
});

module.exports = router;
