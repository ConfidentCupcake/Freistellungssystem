var express = require('express');
var auth = require('../../lib/auth');

var router = express.Router();


router.get('/', async function(req, res, next) {
  res.json({ users: await auth.listUsers() });
});

router.get('/roles', async function(req, res, next) {
  res.json({ roles: await auth.listRoles() });
});

// Die Auswahl für Admins enthält ausschließlich Trainer-ID und Anzeigename.
router.get('/berufstrainer', async function(req, res) {
  res.json({ berufstrainer: await auth.listBerufstrainer() });
});

router.post('/', async function(req, res, next) {
  var user = await auth.createUser(
    req.body.username,
    req.body.password,
    req.body.role,
    req.body.email,
    req.body.assignedBerufstrainerId
  );

  res.status(201).json({ user: user });
});

// Nur Admins dürfen Bestandskonten ohne Trainer erstmals zuweisen oder
// Teilnehmer unabhängig von der eigenen Zuordnung übertragen.
router.put('/:id/zuweisung', async function(req, res) {
  var teilnehmer = await auth.assignTeilnehmer(
    req.params.id, req.body.berufstrainerId, req.session.user
  );
  res.json({ teilnehmer: teilnehmer });
});

router.put('/:id/password', async function(req, res, next) {
  await auth.setPassword(req.params.id, req.body.password, req.sessionID);

  res.status(204).end();
});

router.delete('/:id', async function(req, res, next) {
  await auth.deleteUser(req.params.id, req.session.user.id);

  res.status(204).end();
});

module.exports = router;
