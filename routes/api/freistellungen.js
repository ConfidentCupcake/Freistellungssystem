var express = require('express');
var auth = require('../../lib/auth');
var freistellungen = require('../../lib/freistellungen');

var router = express.Router();

// Dieser Router ist ausschließlich für Teilnehmer. Admin- und Traineransichten
// besitzen eigene Endpunkte mit anderen Sichtbarkeitsregeln.
router.use(function(req, res, next) {
  if (req.session.user.role === 'teilnehmer') return next();
  res.status(403).json({ error: { message: 'Nur für Teilnehmer.' } });
});


router.get('/', async function(req, res, next) {
  res.json({ freistellungen: await freistellungen.listForUser(req.session.user.id) });
});

// Admin-erstellte Teilnehmer tragen ihre Stammdaten nach dem ersten Login
// selbst ein. Die Session erhält anschließend die aktualisierte Anzeige.
router.put('/profil', async function(req, res) {
  var user = await auth.updateOwnProfile(req.session.user.id, req.body);
  req.session.user = user;
  res.json({ user: user });
});

router.post('/', async function(req, res, next) {
  var freistellung = await freistellungen.createForUser(req.session.user.id, req.body);

  res.status(201).json({ freistellung: freistellung });
});

// Die Rückmeldung ist keine Freigabe und kein Abschluss. Sie erfasst nur,
// dass der Teilnehmer seine Rückkehr gemeldet hat.
router.put('/:id/rueckkehr', async function(req, res) {
  var freistellung = await freistellungen.reportBack(req.params.id, req.session.user.id);
  res.json({ freistellung: freistellung });
});

router.put('/:id/unterwegs', async function(req, res) {
  var freistellung = await freistellungen.markOnWay(req.params.id, req.session.user.id);
  res.json({ freistellung: freistellung });
});

module.exports = router;
