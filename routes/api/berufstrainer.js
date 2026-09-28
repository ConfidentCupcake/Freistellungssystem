var express = require('express');
var auth = require('../../lib/auth');
var freistellungen = require('../../lib/freistellungen');

var router = express.Router();

// Der gesamte Router wird in app.js durch Anmeldung und Trainerrolle geschützt.
// Personenlisten enthalten nur das, was der jeweilige Vorgang benötigt.
router.get('/teilnehmer', async function(req, res) {
  res.json({ teilnehmer: await auth.listTeilnehmerForTrainer(req.session.user.id) });
});

router.get('/kollegen', async function(req, res) {
  res.json({ berufstrainer: await auth.listBerufstrainer() });
});

router.post('/teilnehmer', async function(req, res) {
  // Rolle und Trainer stammen nicht aus dem Request: eine Rollenaufwertung
  // oder eine fremde Zuordnung ist über diesen Endpunkt unmöglich.
  var user = await auth.createUser(
    req.body.username, req.body.password, 'teilnehmer', req.body.email,
    req.session.user.id,
    { firstName: req.body.firstName, lastName: req.body.lastName,
      trainingArea: req.body.trainingArea }
  );
  res.status(201).json({ user: user });
});

router.put('/teilnehmer/:id/zuweisung', async function(req, res) {
  var teilnehmer = await auth.assignTeilnehmer(
    req.params.id, req.body.berufstrainerId, req.session.user
  );
  res.json({ teilnehmer: teilnehmer });
});

router.get('/freistellungen', async function(req, res) {
  res.json({ freistellungen: await freistellungen.listForTrainer(req.session.user.id) });
});

router.put('/freistellungen/:id/entscheidung', async function(req, res) {
  var freistellung = await freistellungen.decide(
    req.params.id, req.session.user.id, req.body.status, req.body.note
  );
  res.json({ freistellung: freistellung });
});

router.put('/freistellungen/:id/schliessen', async function(req, res) {
  var freistellung = await freistellungen.close(req.params.id, req.session.user.id);
  res.json({ freistellung: freistellung });
});

// Stornierung statt physischem DELETE: Der Grund bleibt in beiden Ansichten
// und nach einem späteren Trainerwechsel in der Historie erhalten.
router.put('/freistellungen/:id/stornieren', async function(req, res) {
  var freistellung = await freistellungen.cancel(
    req.params.id, req.session.user.id, req.body.reason
  );
  res.json({ freistellung: freistellung });
});

module.exports = router;
