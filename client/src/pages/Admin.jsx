import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

// `email` is optional: an account without one simply signs in by username.
const EMPTY_FORM = { username: '', email: '', password: '', role: '' };

export default function Admin() {
  const { user, logout } = useAuth();

  const [users, setUsers] = useState([]);
  // The dropdown's options come from the user_role enum in the database, so it
  // can never offer a role an INSERT would reject.
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Which row has its password form open, and what has been typed into it.
  const [passwordFor, setPasswordFor] = useState(null);
  const [password, setPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordNotice, setPasswordNotice] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [created, setCreated] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(() => api('/users').then((data) => setUsers(data.users)), []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([api('/users'), api('/users/roles')])
      .then(([userData, roleData]) => {
        if (cancelled) return;
        setUsers(userData.users);
        setRoles(roleData.roles);
        // Preselect the first role so the dropdown is never in a blank state.
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

  function updateField(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setCreated(null);
    setSubmitting(true);

    try {
      const data = await api('/users', { body: form });
      setCreated(data.user);
      // Keep the chosen role: creating several accounts of one kind is the
      // common case, so only the credentials are cleared.
      setForm((current) => ({ ...EMPTY_FORM, role: current.role }));
      await loadUsers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function togglePasswordForm(row) {
    setPasswordError(null);
    setPasswordNotice(null);
    setPassword('');
    setPasswordFor((current) => (current === row.id ? null : row.id));
  }

  async function handlePasswordSubmit(event, row) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);
    setSavingPassword(true);

    try {
      await api(`/users/${row.id}/password`, { method: 'PUT', body: { password } });
      setPasswordNotice(`Passwort von ${row.username} wurde geändert.`);
      setPasswordFor(null);
      setPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Benutzer ${row.username} wirklich löschen?`)) return;

    setDeleteError(null);
    setDeletingId(row.id);

    try {
      await api(`/users/${row.id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="admin">
      <div className="logout">
        <Link to="/">Startseite</Link>
        <span>Angemeldet als {user.username}</span>
        <button type="button" onClick={logout}>
          Abmelden
        </button>
      </div>

      <h1>Administration</h1>

      <section className="admin__section">
        <h2>Benutzer anlegen</h2>

        {formError && (
          <p className="login__error" role="alert">
            {formError}
          </p>
        )}
        {created && (
          <p className="admin__notice" role="status">
            Benutzer {created.username} wurde als {created.role} angelegt.
          </p>
        )}

        <form className="login__form admin__form" onSubmit={handleSubmit}>
          <label htmlFor="new-username">Benutzername</label>
          <input
            id="new-username"
            name="username"
            type="text"
            autoComplete="off"
            required
            value={form.username}
            onChange={updateField('username')}
          />

          <label htmlFor="new-email">E-Mail (optional)</label>
          <input
            id="new-email"
            name="email"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={updateField('email')}
          />

          <label htmlFor="new-password">Passwort</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={updateField('password')}
          />

          <label htmlFor="new-role">Rolle</label>
          <select
            id="new-role"
            name="role"
            required
            value={form.role}
            onChange={updateField('role')}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>

          <button type="submit" disabled={submitting || roles.length === 0}>
            {submitting ? 'Wird angelegt …' : 'Benutzer anlegen'}
          </button>
        </form>

        <p className="admin__hint">
          Die Rolle steht mit dem Anlegen fest und lässt sich später nicht mehr ändern.
          Mit einer E-Mail-Adresse kann sich der Benutzer wahlweise damit oder mit dem
          Benutzernamen anmelden.
        </p>
      </section>

      <section className="admin__section">
        <h2>Benutzer</h2>

        {loading && <p className="page__status">Wird geladen …</p>}
        {loadError && (
          <p className="login__error" role="alert">
            {loadError}
          </p>
        )}
        {deleteError && (
          <p className="login__error" role="alert">
            {deleteError}
          </p>
        )}
        {passwordError && (
          <p className="login__error" role="alert">
            {passwordError}
          </p>
        )}
        {passwordNotice && (
          <p className="admin__notice" role="status">
            {passwordNotice}
          </p>
        )}

        {!loading && !loadError && (
          <table className="admin__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Benutzername</th>
                <th>E-Mail</th>
                <th>Name</th>
                <th>Rolle</th>
                <th>Angelegt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                // A fragment, not a plain <tr>: the password form is a second
                // row underneath, which only a tbody may contain.
                <Fragment key={row.id}>
                  <tr>
                    <td>{row.id}</td>
                    <td>{row.username}</td>
                    <td>{row.email || '—'}</td>
                    <td>{row.displayName || '—'}</td>
                    <td>{row.role}</td>
                    <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString('de-DE') : '—'}</td>
                    <td className="admin__actions">
                      <button
                        type="button"
                        className="admin__action"
                        onClick={() => togglePasswordForm(row)}
                      >
                        {passwordFor === row.id ? 'Abbrechen' : 'Passwort ändern'}
                      </button>
                      {/* The server refuses this too; disabling it just spares
                          the admin a pointless error on their own row. */}
                      <button
                        type="button"
                        className="admin__action admin__action--delete"
                        disabled={row.id === user.id || deletingId === row.id}
                        title={row.id === user.id ? 'Das eigene Konto lässt sich nicht löschen.' : undefined}
                        onClick={() => handleDelete(row)}
                      >
                        {deletingId === row.id ? 'Wird gelöscht …' : 'Löschen'}
                      </button>
                    </td>
                  </tr>

                  {passwordFor === row.id && (
                    <tr>
                      <td colSpan={7}>
                        <form
                          className="admin__password"
                          onSubmit={(event) => handlePasswordSubmit(event, row)}
                        >
                          <label htmlFor={`password-${row.id}`}>Neues Passwort für {row.username}</label>
                          <input
                            id={`password-${row.id}`}
                            type="password"
                            autoComplete="new-password"
                            required
                            autoFocus
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                          />
                          <button type="submit" disabled={savingPassword}>
                            {savingPassword ? 'Wird gespeichert …' : 'Speichern'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
