var express = require('express');
var auth = require('../../lib/auth');
var freistellungen = require('../../lib/freistellungen');

var router = express.Router();

/* The whole router sits behind requireAuth; see the mount in app.js. Every
 * route works on the signed-in user's own releases — the id comes from the
 * session, never from the request, so nobody can read or file for somebody
 * else. Express 5 forwards a rejected promise to the error handler by itself,
 * and the errors lib/freistellungen.js throws already carry a `status`. */

/* GET the caller's own releases. */
router.get('/', async function(req, res, next) {
  res.json({ freistellungen: await freistellungen.listForUser(req.session.user.id) });
});

/* GET the Berufstrainer a request can be assigned to, for the form's dropdown.
 * The only listing of other accounts a non-admin can reach, so lib/auth.js
 * keeps it to ids and names. A literal path: it would have to stay above a
 * '/:id' route if one is ever added here. */
router.get('/berufstrainer', async function(req, res, next) {
  res.json({ berufstrainer: await auth.listBerufstrainer() });
});

/* POST a new request. It starts as 'offen'; the status is not the caller's to
 * set. An assignee may come with it, or be left out entirely. */
router.post('/', async function(req, res, next) {
  var freistellung = await freistellungen.createForUser(req.session.user.id, req.body);

  res.status(201).json({ freistellung: freistellung });
});

module.exports = router;
