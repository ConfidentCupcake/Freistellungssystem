import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { formatDay, formatTime } from '../format.js';
import { AlertIcon, CheckIcon, ChevronIcon, CloseIcon, PlusIcon } from '../icons.jsx';

const EMPTY_FORM = { username: '', email: '', password: '', role: '', assignedBerufstrainerId: '' };

// Singular labels for the role a row carries — RequireAuth.jsx has a plural set
// for its refusal sentence, which reads differently and stays there. A role the
// user_role enum knows but this map does not falls back to the raw value, so
// adding one to the enum needs no change here (and .fs-role renders it in the
// neutral variant).
const ROLE_LABELS = {
  admin: 'Administrator',
  berufstrainer: 'Berufstrainer',
  teilnehmer: 'Teilnehmer'
};

// 'alle' is not a role — it is the unfiltered view, and the first chip. The rest
// of the chips are built from the enum the API hands back, exactly like the
// dropdown in the create form.
const ALL = 'alle';

export default function Admin() {
  const { user, logout } = useAuth();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [trainers, setTrainers] = useState([]);
  // Die angefasste, noch nicht gespeicherte Auswahl je Zeile. Fehlt ein
  // Eintrag, zeigt die Auswahl den gespeicherten Stand der Zeile.
  const [assignment, setAssignment] = useState({});
  const [assignmentError, setAssignmentError] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [filter, setFilter] = useState(ALL);
  const [expandedId, setExpandedId] = useState(null);

  // One banner per outcome rather than one per action: creating an account and
  // resetting a password both end in a sentence at the top of the page, and
  // three separate error paragraphs only made the page jump around.
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [deletingId, setDeletingId] = useState(null);

  // The form is hidden behind a button: the list is what the page is for, and
  // adding an account is the occasional action.
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // The password dialog. `passwordFor` is the row it was opened from — it is
  // what the dialog names and what the PUT goes to, so closing the dialog is
  // what clears it. A native <dialog>, like the Sonstiges one on /teilnehmer:
  // focus trapping, Esc and the backdrop come from the browser.
  const dialogRef = useRef(null);
  const [passwordFor, setPasswordFor] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const loadUsers = useCallback(() => api('/users').then((data) => setUsers(data.users)), []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api('/users'), api('/users/roles'), api('/users/berufstrainer')])
      .then(([userData, roleData, trainerData]) => {
        if (cancelled) return;
        setUsers(userData.users);
        setRoles(roleData.roles);
        setTrainers(trainerData.berufstrainer);
        setForm((current) => ({ ...current, role: current.role || roleData.roles[0] || '' }));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const tally = { [ALL]: users.length };
    users.forEach((row) => {
      tally[row.role] = (tally[row.role] || 0) + 1;
    });
    return tally;
  }, [users]);

  const visible = useMemo(
    () => (filter === ALL ? users : users.filter((row) => row.role === filter)),
    [users, filter]
  );

  // GET /api/users liefert nur assignedBerufstrainerId, der Name steht in der
  // Trainer-Auflistung — die beiden hier einmal zusammenführen, statt für jede
  // aufgeklappte Zeile durch das Array zu suchen.
  const trainerNames = useMemo(() => {
    const byId = {};
    trainers.forEach((trainer) => {
      byId[trainer.id] = trainer.name;
    });
    return byId;
  }, [trainers]);

  function updateField(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function toggleForm() {
    setError(null);
    setNotice(null);
    // The chosen role survives: creating several accounts of one kind is the
    // common case, so only the credentials are cleared.
    setForm((current) => ({ ...EMPTY_FORM, role: current.role }));
    setFormOpen((current) => !current);
  }

  function pickFilter(key) {
    setFilter(key);
    setExpandedId(null);
  }

  function toggleRow(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const data = await api('/users', { body: form });
      setNotice(
        `${data.user.username} wurde als ${ROLE_LABELS[data.user.role] || data.user.role} angelegt.`
      );
      setForm((current) => ({ ...EMPTY_FORM, role: current.role }));
      setFormOpen(false);
      setFilter(ALL);
      await loadUsers();
      if (data.user.role === 'berufstrainer') {
        const updated = await api('/users/berufstrainer');
        setTrainers(updated.berufstrainer);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openPasswordDialog(row) {
    setPasswordFor(row);
    setPassword('');
    setPasswordError(null);
    // showModal() throws if the dialog is already open.
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }

  // Runs for every way out of the dialog — Abbrechen, Esc, and the close() that
  // a successful save calls itself.
  function handleDialogClose() {
    setPasswordFor(null);
    setPassword('');
    setPasswordError(null);
  }

  // The error stays inside the dialog: it belongs to the field the admin is
  // looking at, and the dialog covers the banner at the top of the page anyway.
  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const row = passwordFor;
    if (!row) return;

    setPasswordError(null);
    setSavingPassword(true);

    try {
      await api(`/users/${row.id}/password`, { method: 'PUT', body: { password } });
      setNotice(`Das Passwort von ${row.username} wurde geändert.`);
      dialogRef.current?.close();
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Benutzer ${row.username} wirklich löschen?`)) return;

    setError(null);
    setNotice(null);
    setDeletingId(row.id);

    try {
      await api(`/users/${row.id}`, { method: 'DELETE' });
      setNotice(`${row.username} wurde gelöscht.`);
      setExpandedId(null);
      await loadUsers();
      if (row.role === 'berufstrainer') {
        const updated = await api('/users/berufstrainer');
        setTrainers(updated.berufstrainer);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // Auch Bestandskonten ohne Zuordnung können hier einem Trainer zugewiesen
  // werden. Die API verhindert einen Wechsel bei laufenden Anträgen.
  async function handleAssignment(row) {
    const targetId = assignment[row.id];

    setAssignmentError(null);
    setNotice(null);
    setAssigningId(row.id);

    try {
      await api(`/users/${row.id}/zuweisung`, {
        method: 'PUT', body: { berufstrainerId: targetId }
      });
      setNotice(
        `${row.username} wurde ${trainerNames[targetId] || 'dem Berufstrainer'} zugewiesen.`
      );
      await loadUsers();
      // Den angefassten Stand verwerfen, damit die Auswahl wieder das zeigt,
      // was gerade neu geladen wurde.
      setAssignment((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setAssignmentError(err.message);
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="fs">
      <header className="fs-bar">
        <div className="fs-bar__brand">
          <span className="fs-bar__mark">BTZ</span>
          <span className="fs-bar__name">Freistellungen</span>
        </div>
        <div className="fs-bar__spacer" />
        <Link className="fs-bar__link" to="/">
          Startseite
        </Link>
        <span className="fs-bar__user">{user.displayName || user.username}</span>
        <span className="fs-bar__role">Administrator</span>
        <button type="button" className="fs-bar__logout" onClick={logout}>
          Abmelden
        </button>
      </header>

      <main className="fs-main">
        <div className="fs-headline">
          <div className="fs-headline__text">
            <h1 className="fs-h1">Benutzerverwaltung</h1>
            <p className="fs-sub">
              Konten anlegen, Passwörter zurücksetzen und sehen, wer mit welcher Rolle arbeitet.
            </p>
          </div>
          <button type="button" className="fs-btn fs-btn--primary" onClick={toggleForm}>
            <PlusIcon />
            {formOpen ? 'Anlegen abbrechen' : 'Benutzer anlegen'}
          </button>
        </div>

        {error && (
          <p className="fs-banner fs-banner--error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </p>
        )}

        {notice && (
          <p className="fs-banner fs-banner--ok" role="status">
            <CheckIcon />
            <span className="fs-banner__text">{notice}</span>
            <button
              type="button"
              className="fs-banner__close"
              onClick={() => setNotice(null)}
              aria-label="Hinweis schließen"
            >
              <CloseIcon />
            </button>
          </p>
        )}

        {formOpen && (
          <section className="fs-card fs-form-card">
            <div className="fs-form-card__head">
              <span className="fs-eyebrow">Neues Konto</span>
              <button
                type="button"
                className="fs-form-card__close"
                onClick={toggleForm}
                aria-label="Formular schließen"
              >
                <CloseIcon />
              </button>
            </div>

            <form className="fs-form" onSubmit={handleSubmit}>
              <div className="fs-form__grid">
                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="new-username">
                    Benutzername
                  </label>
                  <input
                    id="new-username"
                    name="username"
                    className="fs-input"
                    type="text"
                    autoComplete="off"
                    required
                    value={form.username}
                    onChange={updateField('username')}
                  />
                </div>

                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="new-email">
                    E-Mail (optional)
                  </label>
                  <input
                    id="new-email"
                    name="email"
                    className="fs-input"
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={updateField('email')}
                  />
                </div>

                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="new-password">
                    Passwort
                  </label>
                  <input
                    id="new-password"
                    name="password"
                    className="fs-input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={updateField('password')}
                  />
                </div>

                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="new-role">
                    Rolle
                  </label>
                  {/* Never a hardcoded list: these come from GET /api/users/roles,
                      which reads the user_role enum. */}
                  <select
                    id="new-role"
                    name="role"
                    className="fs-input fs-select"
                    required
                    value={form.role}
                    onChange={(event) => setForm((current) => ({
                      ...current, role: event.target.value, assignedBerufstrainerId: ''
                    }))}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role] || role}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nur für Teilnehmer, und dann verbindlich: jedes neue
                    Teilnehmerkonto bekommt einen Berufstrainer. Der Wechsel der
                    Rolle leert das Feld wieder (siehe onChange oben). */}
                {form.role === 'teilnehmer' && (
                  <div className="fs-field">
                    <label className="fs-eyebrow" htmlFor="new-trainer">
                      Zugewiesener Berufstrainer
                    </label>
                    <select
                      id="new-trainer"
                      name="assignedBerufstrainerId"
                      className="fs-input fs-select"
                      required
                      value={form.assignedBerufstrainerId}
                      onChange={updateField('assignedBerufstrainerId')}
                    >
                      <option value="">Bitte wählen …</option>
                      {trainers.map((trainer) => (
                        <option key={trainer.id} value={trainer.id}>
                          {trainer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="fs-form__actions">
                <p className="fs-form__hint">
                  Die Rolle steht mit dem Anlegen fest und lässt sich später nicht mehr ändern. Mit
                  einer E-Mail-Adresse kann sich der Benutzer wahlweise damit oder mit dem
                  Benutzernamen anmelden.
                </p>
                <button type="button" className="fs-btn fs-btn--ghost" onClick={toggleForm}>
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="fs-btn fs-btn--primary"
                  disabled={submitting || roles.length === 0}
                >
                  {submitting ? 'Wird angelegt …' : 'Benutzer anlegen'}
                </button>
              </div>
            </form>
          </section>
        )}

        {loading && <p className="page__status">Wird geladen …</p>}

        {loadError && (
          <p className="fs-banner fs-banner--error" role="alert">
            <AlertIcon />
            <span>{loadError}</span>
          </p>
        )}

        {/* Die Zuweisung hat ihr eigenes Banner: sie wird aus einer
            aufgeklappten Zeile ausgelöst, nicht aus dem Formular, und ihr
            Fehler soll den Hinweis des Anlegens nicht überschreiben. */}
        {assignmentError && (
          <p className="fs-banner fs-banner--error" role="alert">
            <AlertIcon />
            <span>{assignmentError}</span>
          </p>
        )}

        {!loading && !loadError && (
          <section className="fs-card">
            <div className="fs-filters">
              <button
                type="button"
                className={`fs-chip${filter === ALL ? ' is-on' : ''}`}
                aria-pressed={filter === ALL}
                onClick={() => pickFilter(ALL)}
              >
                Alle
                <span className="fs-chip__count fs-mono">{counts[ALL] || 0}</span>
              </button>
              {roles.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`fs-chip${filter === role ? ' is-on' : ''}`}
                  aria-pressed={filter === role}
                  onClick={() => pickFilter(role)}
                >
                  {ROLE_LABELS[role] || role}
                  <span className="fs-chip__count fs-mono">{counts[role] || 0}</span>
                </button>
              ))}
            </div>

            <div className="fs-row fs-row--users fs-head">
              <span className="fs-eyebrow fs-row__account">Konto</span>
              <span className="fs-eyebrow fs-row__person">Name</span>
              <span className="fs-eyebrow fs-row__role">Rolle</span>
              <span className="fs-eyebrow fs-row__created">Angelegt</span>
              <span className="fs-row__chevron" />
            </div>

            {visible.map((row) => {
              const open = expandedId === row.id;
              const self = row.id === user.id;

              return (
                <div className="fs-entry" key={row.id}>
                  {/* The row is the whole hit area and the actions live in the
                      panel it opens — a button nested inside a role="button" is
                      what a screen reader would have to untangle otherwise. */}
                  <div
                    className={`fs-row fs-row--users fs-row--data${open ? ' is-open' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleRow(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleRow(row.id);
                      }
                    }}
                  >
                    <div className="fs-row__account">
                      <div className="fs-row__name">
                        {row.username}
                        {self && <span className="fs-self">Sie</span>}
                      </div>
                      <div className="fs-row__mail">{row.email || 'Keine E-Mail-Adresse'}</div>
                    </div>

                    <div className="fs-row__person">{row.displayName || '—'}</div>

                    <div className="fs-row__role">
                      {/* One class per enum value; an unknown role keeps the
                          neutral base styling rather than losing its chip. */}
                      <span className={`fs-role fs-role--${row.role}`}>
                        <span className="fs-role__dot" />
                        {ROLE_LABELS[row.role] || row.role}
                      </span>
                    </div>

                    <div className="fs-mono fs-row__created">{formatDay(row.createdAt)}</div>

                    <ChevronIcon className={`fs-row__chevron${open ? ' is-open' : ''}`} />
                  </div>

                  {open && (
                    <>
                      <dl className="fs-detail fs-detail--tight">
                        <dt className="fs-eyebrow">Benutzer-ID</dt>
                        <dd className="fs-mono">{row.id}</dd>
                        <dt className="fs-eyebrow">E-Mail</dt>
                        <dd>{row.email || 'Keine — Anmeldung nur mit dem Benutzernamen'}</dd>
                        <dt className="fs-eyebrow">Anzeigename</dt>
                        <dd>{row.displayName || '—'}</dd>
                        {row.role === 'teilnehmer' && (
                          <>
                            <dt className="fs-eyebrow">Berufstrainer</dt>
                            <dd>{trainerNames[row.assignedBerufstrainerId] || 'Nicht zugewiesen'}</dd>
                          </>
                        )}
                        <dt className="fs-eyebrow">Angelegt am</dt>
                        <dd className="fs-mono">
                          {row.createdAt
                            ? `${formatDay(row.createdAt)} um ${formatTime(row.createdAt)} Uhr`
                            : '—'}
                        </dd>
                      </dl>

                      {/* Die Zuweisung sitzt im aufgeklappten Bereich wie die
                          übrigen Aktionen: die Zeile selbst ist ein
                          role="button" und duldet keine Bedienelemente. Die
                          Auswahl zeigt den gespeicherten Stand, solange nichts
                          angefasst wurde — ein Wechsel bei laufenden Anträgen
                          weist die API zurück. */}
                      {row.role === 'teilnehmer' && (
                        <div className="fs-actions">
                          <label className="fs-eyebrow" htmlFor={`trainer-${row.id}`}>
                            Berufstrainer zuweisen
                          </label>
                          <select
                            id={`trainer-${row.id}`}
                            className="fs-input fs-select fs-select--sm"
                            value={assignment[row.id] ?? row.assignedBerufstrainerId ?? ''}
                            onChange={(event) => setAssignment((current) => ({
                              ...current, [row.id]: event.target.value
                            }))}
                          >
                            <option value="">Nicht zugewiesen</option>
                            {trainers.map((trainer) => (
                              <option key={trainer.id} value={trainer.id}>
                                {trainer.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="fs-btn fs-btn--ghost fs-btn--sm"
                            disabled={
                              !assignment[row.id]
                              || Number(assignment[row.id]) === row.assignedBerufstrainerId
                              || assigningId === row.id
                            }
                            onClick={() => handleAssignment(row)}
                          >
                            {assigningId === row.id ? 'Wird zugewiesen …' : 'Zuweisen'}
                          </button>
                        </div>
                      )}

                      <div className="fs-actions">
                        <button
                          type="button"
                          className="fs-btn fs-btn--ghost fs-btn--sm"
                          onClick={() => openPasswordDialog(row)}
                        >
                          Passwort ändern
                        </button>
                        {/* The server refuses this too; disabling it just spares
                            the admin a pointless error on their own row. */}
                        <button
                          type="button"
                          className="fs-btn fs-btn--danger fs-btn--sm"
                          disabled={self || deletingId === row.id}
                          onClick={() => handleDelete(row)}
                        >
                          {deletingId === row.id ? 'Wird gelöscht …' : 'Löschen'}
                        </button>
                        <p className="fs-actions__hint">
                          {self
                            ? 'Das eigene Konto lässt sich nicht löschen — es würde die laufende Sitzung beenden.'
                            : 'Ein zurückgesetztes Passwort meldet den Benutzer überall ab. Die Rolle bleibt, wie sie ist.'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="fs-none">
                <p className="fs-none__title">Kein Konto mit dieser Rolle.</p>
                <p className="fs-none__text">Wählen Sie oben „Alle“, um wieder alles zu sehen.</p>
              </div>
            )}
          </section>
        )}

        <p className="fs-footnote">
          Eine Rolle wird beim Anlegen vergeben und lässt sich danach nicht mehr ändern — für eine
          andere Rolle ein neues Konto anlegen. Ein Benutzer, für den noch Freistellungen erfasst
          sind, lässt sich nicht löschen.
        </p>

        {/* Outside the form card on purpose: the password dialog has to be
            reachable whether or not the create form happens to be open. */}
        <dialog
          className="fs-dialog"
          ref={dialogRef}
          onClose={handleDialogClose}
          aria-labelledby="password-dialog-title"
        >
          <form className="fs-dialog__form" onSubmit={handlePasswordSubmit}>
            <h2 className="fs-dialog__title" id="password-dialog-title">
              Passwort ändern
            </h2>
            <p className="fs-dialog__text">
              Neues Passwort für <strong>{passwordFor?.username}</strong>. Das alte wird nicht
              abgefragt; alle anderen Sitzungen dieses Kontos werden beendet.
            </p>

            {passwordError && (
              <p className="fs-banner fs-banner--error fs-dialog__banner" role="alert">
                <AlertIcon />
                <span>{passwordError}</span>
              </p>
            )}

            <input
              className="fs-input"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              aria-label="Neues Passwort"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <div className="fs-dialog__actions">
              <button
                type="button"
                className="fs-btn fs-btn--ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Abbrechen
              </button>
              <button type="submit" className="fs-btn fs-btn--primary" disabled={savingPassword}>
                {savingPassword ? 'Wird gespeichert …' : 'Speichern'}
              </button>
            </div>
          </form>
        </dialog>
      </main>
    </div>
  );
}
