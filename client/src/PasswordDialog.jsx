/*
 * The "change my own password" dialog, shared by /teilnehmer and /berufstrainer.
 * It lives here rather than in either page because both need exactly the same
 * form; the *button* that opens it stays in each page, because the two headers
 * look nothing alike (a top bar on one, a sidebar on the other) and the button
 * has to wear that page's classes.
 *
 * It is a native <dialog> like the others in this app (the Sonstiges dialog on
 * /teilnehmer, the reset dialog on /admin): focus trapping, Esc and the backdrop
 * come from the browser. It draws on the .fs-dialog block in styles.css, which
 * main.jsx loads globally — that is what lets it look right on the Berufstrainer
 * page too, even though that page otherwise uses its own .trainer-* stylesheet.
 *
 * This is PUT /api/auth/password, not the admin reset behind /api/users: the old
 * password is required, and the caller's own session survives while every other
 * session of the account is dropped.
 */

import { useEffect, useRef, useState } from 'react';

import { api } from './api.js';
import { AlertIcon } from './icons.jsx';

export default function PasswordDialog({ open, onClose, onDone }) {
  const ref = useRef(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // showModal() throws if the dialog is already open, and close() on a closed
  // dialog fires no event — hence the guard on both sides.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Runs for every way out: Abbrechen, Esc, the backdrop, and the close() that a
  // successful save calls itself. Clearing the fields here means a reopened
  // dialog never shows what was typed last time.
  function handleClose() {
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Checked here and not on the server: the server is told one new password,
    // so a typo in it is only detectable while both fields still exist. Without
    // this, a mistyped password would lock the user out of their own account.
    if (next !== repeat) {
      setError('Die beiden neuen Passwörter stimmen nicht überein.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { currentPassword: current, newPassword: next }
      });
      // close() triggers handleClose, which clears the fields.
      ref.current?.close();
      onDone('Ihr Passwort wurde geändert. Andere Geräte sind jetzt abgemeldet.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      className="fs-dialog"
      ref={ref}
      onClose={handleClose}
      aria-labelledby="own-password-title"
    >
      <form className="fs-dialog__form" onSubmit={handleSubmit}>
        <h2 className="fs-dialog__title" id="own-password-title">
          Passwort ändern
        </h2>
        <p className="fs-dialog__text">
          Zur Sicherheit wird das aktuelle Passwort abgefragt. Nach der Änderung bleiben Sie hier
          angemeldet — alle anderen Geräte werden abgemeldet.
        </p>

        {error && (
          <p className="fs-banner fs-banner--error fs-dialog__banner" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </p>
        )}

        <div className="fs-field">
          <label className="fs-eyebrow" htmlFor="own-password-current">
            Aktuelles Passwort
          </label>
          <input
            id="own-password-current"
            className="fs-input"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>

        <div className="fs-field">
          <label className="fs-eyebrow" htmlFor="own-password-new">
            Neues Passwort
          </label>
          <input
            id="own-password-new"
            className="fs-input"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>

        <div className="fs-field">
          <label className="fs-eyebrow" htmlFor="own-password-repeat">
            Neues Passwort wiederholen
          </label>
          <input
            id="own-password-repeat"
            className="fs-input"
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </div>

        <div className="fs-dialog__actions">
          <button
            type="button"
            className="fs-btn fs-btn--ghost"
            onClick={() => ref.current?.close()}
          >
            Abbrechen
          </button>
          <button type="submit" className="fs-btn fs-btn--primary" disabled={saving}>
            {saving ? 'Wird gespeichert …' : 'Passwort ändern'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
