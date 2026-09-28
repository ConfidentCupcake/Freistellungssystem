var createError = require('http-errors');
var express = require('express');
var fs = require('fs');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var pgSession = require('connect-pg-simple')(session);
var crypto = require('crypto');

var db = require('./lib/db');
var auth = require('./lib/auth');
var apiAuthRouter = require('./routes/api/auth');
var apiUsersRouter = require('./routes/api/users');
var apiFreistellungenRouter = require('./routes/api/freistellungen');
var apiTrainerRouter = require('./routes/api/berufstrainer');

var app = express();

var clientDir = path.join(__dirname, 'client', 'dist');
var clientIndex = path.join(clientDir, 'index.html');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(clientDir));

app.use(session({
  name: 'sid',
  store: new pgSession({
    pool: db.pool,
    tableName: 'session',
    createTableIfMissing: false,
    pruneSessionInterval: 60 * 15
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: app.get('env') === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// Jede API erhält ihre eigene Rollenprüfung. Die React-Routen sind nur
// Darstellungsschutz; die Rechte werden auf dem Server durchgesetzt.
app.use('/api/auth', apiAuthRouter);
app.use('/api/users', auth.requireAuth, auth.requireAdmin, apiUsersRouter);
app.use('/api/freistellungen', auth.requireAuth, apiFreistellungenRouter);
app.use('/api/berufstrainer', auth.requireAuth, auth.requireTrainer, apiTrainerRouter);

app.use('/api', function(req, res, next) {
  next(createError(404));
});

app.get('/*splat', function(req, res, next) {
  if (!fs.existsSync(clientIndex)) {
    return next(createError(404, 'Client build missing — run `npm run build` (or `npm run dev` for the Vite dev server).'));
  }
  res.sendFile(clientIndex);
});

app.use(function(req, res, next) {
  next(createError(404));
});

app.use(function(err, req, res, next) {
  var status = err.status || 500;
  var development = req.app.get('env') === 'development';

  res.status(status);
  res.json({
    error: {
      status: status,
      message: err.message,
      stack: development ? err.stack : undefined
    }
  });
});

module.exports = app;
