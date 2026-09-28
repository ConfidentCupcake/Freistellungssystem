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

var app = express();

// The React app is built by Vite into client/dist. In development it is served
// by the Vite dev server instead, which proxies /api back here — so this
// directory is simply absent until `npm run build` has run.
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
  // Sessions live in the `session` table (created by a migration, hence
  // createTableIfMissing: false) and share the app's connection pool, so they
  // survive a restart and work across multiple server processes.
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

app.use('/api/auth', apiAuthRouter);
// User administration is admin-only, all of it: listing accounts and creating
// them both sit behind requireAdmin.
app.use('/api/users', auth.requireAuth, auth.requireAdmin, apiUsersRouter);
// Every route in here works on the caller's own releases, so a signed-in user
// of any role is enough — the session decides whose rows they see.
app.use('/api/freistellungen', auth.requireAuth, apiFreistellungenRouter);

// Unknown API paths are a 404 in JSON, never the SPA shell below.
app.use('/api', function(req, res, next) {
  next(createError(404));
});

// Everything else is a client-side route: hand back the SPA shell and let the
// React router decide what it means.
app.get('/*splat', function(req, res, next) {
  if (!fs.existsSync(clientIndex)) {
    return next(createError(404, 'Client build missing — run `npm run build` (or `npm run dev` for the Vite dev server).'));
  }
  res.sendFile(clientIndex);
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
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
