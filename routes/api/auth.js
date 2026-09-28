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

/* POST logout. */
router.post('/logout', function(req, res, next) {
  req.session.destroy(function(err) {
    if (err) return next(err);
    res.clearCookie('sid');
    res.json({ user: null });
  });
});

module.exports = router;
