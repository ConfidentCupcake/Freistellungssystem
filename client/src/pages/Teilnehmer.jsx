import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordDialog from '../PasswordDialog.jsx';
import { formatDay, formatTime } from '../format.js';
import { AlertIcon, CheckIcon, ChevronIcon, CloseIcon, PlusIcon } from '../icons.jsx';
import { OTHER_REASON, REASONS } from '../reasons.js';
import { FILTERS, PHASE_LABELS, groupFor, phaseFor } from '../freistellungStatus.js';

const EMPTY_FORM = {
  startDate: '',
  endDate: '',
  reason: '',
  customReason: ''
};

// The interval is half-open, exactly as the API stores it: 00:00 to 00:00 of
// the following day is one whole day, so whole days are counted rather than the
// calendar dates the range touches.
function formatSpan(start, end) {
  const hours = Math.round((new Date(end) - new Date(start)) / 3600000);

  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 Tag' : `${days} Tage`;
  }

  return hours === 1 ? '1 Std.' : `${hours} Std.`;
}

function formatRange(start, end) {
  const from = formatDay(start);
  const to = formatDay(end);

  return from === to ? from : `${from} – ${to}`;
}

function toIso(value) {
  return new Date(value).toISOString();
}

export default function Teilnehmer() {
  const { user, logout, updateUser } = useAuth();

  const [freistellungen, setFreistellungen] = useState([]);
  // Ein Zeitgeber aktualisiert die Ansicht bei Beginn des Termins ohne Reload.
  const [now, setNow] = useState(Date.now());
  const [actionId, setActionId] = useState(null);
  const [profile, setProfile] = useState({
    firstName: user.firstName || '', lastName: user.lastName || '',
    trainingArea: user.trainingArea || ''
  });
  const [profileOpen, setProfileOpen] = useState(!user.firstName || !user.lastName || !user.trainingArea);
  const [profileError, setProfileError] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [filter, setFilter] = useState('alle');
  const [expandedId, setExpandedId] = useState(null);

  const [passwordOpen, setPasswordOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogRef = useRef(null);
  const reasonBeforeDialog = useRef('');
  const [dialogText, setDialogText] = useState('');

  useEffect(() => {
    let cancelled = false;

    api('/freistellungen')
      .then((list) => {
        if (cancelled) return;
        setFreistellungen(list.freistellungen);
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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    const tally = { alle: freistellungen.length };
    freistellungen.forEach((row) => {
      const group = groupFor(row, now);
      tally[group] = (tally[group] || 0) + 1;
    });
    return tally;
  }, [freistellungen, now]);

  const visible = useMemo(
    () => (filter === 'alle' ? freistellungen : freistellungen.filter((row) => groupFor(row, now) === filter)),
    [freistellungen, filter, now]
  );

  function updateField(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function toggleForm() {
    setFormError(null);
    setNotice(null);
    setForm(EMPTY_FORM);
    setFormOpen((current) => !current);
  }

  function openReasonDialog() {
    setDialogText(form.customReason);
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }

  function handleReasonChange(event) {
    const value = event.target.value;

    if (value !== OTHER_REASON) {
      setForm((current) => ({ ...current, reason: value, customReason: '' }));
      return;
    }

    reasonBeforeDialog.current = form.reason;
    setForm((current) => ({ ...current, reason: OTHER_REASON }));
    openReasonDialog();
  }

  function confirmReason(event) {
    event.preventDefault();
    const text = dialogText.trim();
    if (!text) return;

    setForm((current) => ({ ...current, customReason: text }));
    dialogRef.current?.close();
  }

  function handleDialogClose() {
    setForm((current) => ({
      ...current,
      reason: current.customReason ? OTHER_REASON : reasonBeforeDialog.current
    }));
  }

  function pickFilter(key) {
    setFilter(key);
    setExpandedId(null);
  }

  function toggleRow(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  // Teilnehmer können „unterwegs“ und „zurück“ melden, aber niemals selbst
  // genehmigen oder schließen. Nach der Aktion wird die Serverliste geladen.
  async function report(id, action) {
    // Die Unterwegs-Meldung ist ein vorgezogener Zustandswechsel. Eine
    // Bestätigung verhindert versehentliche Klicks vor dem geplanten Beginn.
    if (action === 'unterwegs' && !window.confirm(
      'Jetzt „bei Termin“ melden? Der Berufstrainer sieht diesen Status sofort.'
    )) return;
    setActionId(id);
    setFormError(null);
    try {
      await api(`/freistellungen/${id}/${action}`, { method: 'PUT' });
      const list = await api('/freistellungen');
      setFreistellungen(list.freistellungen);
      setNow(Date.now());
      setNotice(action === 'rueckkehr'
        ? 'Ihre Rückkehr wurde gemeldet. Der Berufstrainer bestätigt den Abschluss.'
        : 'Sie wurden als bei Termin vorgemerkt.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setActionId(null);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    try {
      const result = await api('/freistellungen/profil', { method: 'PUT', body: profile });
      updateUser(result.user);
      setProfileOpen(false);
      setNotice('Ihre Angaben wurden gespeichert.');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const reason = form.reason === OTHER_REASON ? form.customReason.trim() : form.reason;

    if (!reason) {
      setFormError('Bitte geben Sie einen Grund an.');
      if (form.reason === OTHER_REASON) openReasonDialog();
      return;
    }

    setFormError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const data = await api('/freistellungen', {
        body: {
          startDate: toIso(form.startDate),
          endDate: toIso(form.endDate),
          reason,
        }
      });

      const list = await api('/freistellungen');
      setFreistellungen(list.freistellungen);
      setFilter('alle');
      setNotice(`Ihr Antrag für den ${formatDay(data.freistellung.startDate)} wurde eingereicht.`);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fs">
      <header className="fs-bar">
        <div className="fs-bar__brand">
          <span className="fs-bar__mark">BTZ</span>
          <span className="fs-bar__name">Freistellungen</span>
        </div>
        <button
          type="button"
          className="fs-bar__action"
          onClick={() => setPasswordOpen(true)}
        >
          Passwort ändern
        </button>
        <div className="fs-bar__spacer" />
        <Link className="fs-bar__link" to="/">
          Startseite
        </Link>
        <span className="fs-bar__user">{user.displayName || user.username}</span>
        <span className="fs-bar__role">Teilnehmer</span>
        <button type="button" className="fs-bar__logout" onClick={logout}>
          Abmelden
        </button>
      </header>

      <main className="fs-main">
        <section className="fs-card" style={{ marginBottom: 20, padding: 18 }}>
          <button type="button" className="fs-btn fs-btn--ghost"
            onClick={() => setProfileOpen((current) => !current)}>Meine Angaben</button>
          {profileOpen && <form className="fs-form" onSubmit={saveProfile}>
            <p>Ergänzen Sie Ihren Namen und Ausbildungsbereich.</p>
            {profileError && <p role="alert" className="fs-banner fs-banner--error">{profileError}</p>}
            <div className="fs-form__grid">
              <label className="fs-field">Vorname
                <input className="fs-input" required maxLength={100} value={profile.firstName}
                  onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} />
              </label>
              <label className="fs-field">Nachname
                <input className="fs-input" required maxLength={100} value={profile.lastName}
                  onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} />
              </label>
              <label className="fs-field">Ausbildungsbereich
                <input className="fs-input" required maxLength={150} value={profile.trainingArea}
                  onChange={(event) => setProfile({ ...profile, trainingArea: event.target.value })} />
              </label>
            </div>
            <button className="fs-btn fs-btn--primary" disabled={savingProfile} type="submit">
              Angaben speichern
            </button>
          </form>}
        </section>
        <div className="fs-headline">
          <div className="fs-headline__text">
            <h1 className="fs-h1">Meine Freistellungen</h1>
            <p className="fs-sub">
              Beantragen Sie eine Freistellung und verfolgen Sie, wie darüber entschieden wird.
            </p>
          </div>
          <button type="button" className="fs-btn fs-btn--primary" onClick={toggleForm}>
            <PlusIcon />
            {formOpen ? 'Antrag verwerfen' : 'Freistellung beantragen'}
          </button>
        </div>

        {formError && (
          <p className="fs-banner fs-banner--error" role="alert">
            <AlertIcon />
            <span>{formError}</span>
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
              <span className="fs-eyebrow">Neuer Antrag</span>
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
                  <label className="fs-eyebrow" htmlFor="start-date">
                    Beginn
                  </label>
                  <input
                    id="start-date"
                    name="startDate"
                    className="fs-input fs-mono"
                    type="datetime-local"
                    required
                    value={form.startDate}
                    onChange={updateField('startDate')}
                  />
                </div>
                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="end-date">
                    Ende (nicht mehr enthalten)
                  </label>
                  <input
                    id="end-date"
                    name="endDate"
                    className="fs-input fs-mono"
                    type="datetime-local"
                    required
                    value={form.endDate}
                    onChange={updateField('endDate')}
                  />
                </div>

                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="reason">
                    Grund
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    className="fs-input fs-select"
                    required
                    value={form.reason}
                    onChange={handleReasonChange}
                  >
                    <option value="" disabled>
                      Bitte wählen …
                    </option>
                    {REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                    <option value={OTHER_REASON}>{OTHER_REASON} …</option>
                  </select>

                  {form.reason === OTHER_REASON && form.customReason && (
                    <p className="fs-custom">
                      <span className="fs-custom__text">{form.customReason}</span>
                      <button type="button" className="fs-custom__edit" onClick={openReasonDialog}>
                        Ändern
                      </button>
                    </p>
                  )}
                </div>

              </div>

              <div className="fs-form__actions">
                <p className="fs-form__hint">
                  Ihr Berufstrainer entscheidet über den Antrag. Bis dahin bleibt er offen.
                </p>
                <button type="button" className="fs-btn fs-btn--ghost" onClick={toggleForm}>
                  Abbrechen
                </button>
                <button type="submit" className="fs-btn fs-btn--primary" disabled={submitting}>
                  {submitting ? 'Wird gesendet …' : 'Antrag absenden'}
                </button>
              </div>
            </form>

            <dialog
              className="fs-dialog"
              ref={dialogRef}
              onClose={handleDialogClose}
              aria-labelledby="custom-reason-title"
            >
              <form className="fs-dialog__form" onSubmit={confirmReason}>
                <h2 className="fs-dialog__title" id="custom-reason-title">
                  Grund angeben
                </h2>
                <p className="fs-dialog__text">
                  Beschreiben Sie kurz, wofür Sie die Zeit brauchen. Das steht später so im
                  Antrag.
                </p>
                <textarea
                  className="fs-input fs-textarea"
                  rows={3}
                  required
                  autoFocus
                  maxLength={300}
                  placeholder="z. B. Begleitung zu einem Termin meiner Tochter"
                  value={dialogText}
                  onChange={(event) => setDialogText(event.target.value)}
                />
                <div className="fs-dialog__actions">
                  <button
                    type="button"
                    className="fs-btn fs-btn--ghost"
                    onClick={() => dialogRef.current?.close()}
                  >
                    Abbrechen
                  </button>
                  <button type="submit" className="fs-btn fs-btn--primary">
                    Übernehmen
                  </button>
                </div>
              </form>
            </dialog>
          </section>
        )}

        {loading && <p className="page__status">Wird geladen …</p>}

        {loadError && (
          <p className="fs-banner fs-banner--error" role="alert">
            <AlertIcon />
            <span>{loadError}</span>
          </p>
        )}

        {!loading && !loadError && freistellungen.length === 0 && (
          <section className="fs-card fs-empty">
            <CalendarIcon />
            <h2 className="fs-empty__title">Noch keine Freistellung beantragt</h2>
            <p className="fs-empty__text">
              Sobald Sie einen Antrag stellen, erscheint er hier mit seinem Status — von „offen“ bis
              zur Entscheidung Ihres Berufstrainers.
            </p>
            {!formOpen && (
              <button type="button" className="fs-btn fs-btn--primary" onClick={toggleForm}>
                <PlusIcon />
                Ersten Antrag stellen
              </button>
            )}
          </section>
        )}

        {!loading && !loadError && freistellungen.length > 0 && (
          <section className="fs-card">
            <div className="fs-filters">
              {FILTERS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`fs-chip${filter === entry.key ? ' is-on' : ''}`}
                  aria-pressed={filter === entry.key}
                  onClick={() => pickFilter(entry.key)}
                >
                  {entry.label}
                  <span className="fs-chip__count fs-mono">{counts[entry.key] || 0}</span>
                </button>
              ))}
            </div>

            <div className="fs-row fs-head">
              <span className="fs-eyebrow fs-row__period">Zeitraum</span>
              <span className="fs-eyebrow fs-row__reason">Grund</span>
              <span className="fs-eyebrow fs-row__status">Status</span>
              <span className="fs-eyebrow fs-row__requested">Beantragt</span>
              <span className="fs-row__chevron" />
            </div>

            {visible.map((row) => {
              const open = expandedId === row.id;
              const phase = phaseFor(row, now);

              return (
                <div className="fs-entry" key={row.id}>
                  <div
                    className={`fs-row fs-row--data${open ? ' is-open' : ''}`}
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
                    <div className="fs-row__period">
                      <div className="fs-mono fs-row__days">{formatRange(row.startDate, row.endDate)}</div>
                      <div className="fs-row__times">
                        {formatTime(row.startDate)} – {formatTime(row.endDate)} ·{' '}
                        {formatSpan(row.startDate, row.endDate)}
                      </div>
                    </div>

                    <div className="fs-row__reason">{row.reason || '—'}</div>

                    <div className="fs-row__status">
                      <span className={`fs-status fs-status--${row.status}`}>
                        <span className="fs-status__dot" />
                        {PHASE_LABELS[phase] || row.status}
                      </span>
                    </div>

                    <div className="fs-mono fs-row__requested">{formatDay(row.requestedAt)}</div>

                    <ChevronIcon className={`fs-row__chevron${open ? ' is-open' : ''}`} />
                  </div>

                  {open && (
                    <dl className="fs-detail">
                      <dt className="fs-eyebrow">Grund</dt>
                      <dd>{row.reason || '—'}</dd>
                      <dt className="fs-eyebrow">Berufstrainer</dt>
                      <dd>{row.assignedBerufstrainer || 'Noch nicht zugewiesen'}</dd>
                      {row.status === 'genehmigt' && !row.reportedBackAt && (
                        <>
                          <dt className="fs-eyebrow">Rückmeldung</dt>
                          <dd>
                            {phase === 'genehmigt' && (
                              <button className="fs-btn fs-btn--ghost" type="button"
                                disabled={actionId === row.id}
                                onClick={() => report(row.id, 'unterwegs')}>Bei Termin melden</button>
                            )}
                            {new Date(row.startDate).getTime() <= now && (
                              <button className="fs-btn fs-btn--primary" type="button"
                                disabled={actionId === row.id}
                                onClick={() => report(row.id, 'rueckkehr')}>Zurück vom Termin melden</button>
                            )}
                          </dd>
                        </>
                      )}
                      {row.reportedBackAt && (
                        <><dt className="fs-eyebrow">Rückkehr gemeldet</dt>
                          <dd>{formatDay(row.reportedBackAt)} um {formatTime(row.reportedBackAt)} Uhr</dd></>
                      )}
                      {row.cancellationReason && (
                        <><dt className="fs-eyebrow">Stornierungsgrund</dt>
                          <dd>{row.cancellationReason}</dd></>
                      )}
                      <dt className="fs-eyebrow">Anmerkung</dt>
                      <dd>{row.decisionNote || '—'}</dd>
                      <dt className="fs-eyebrow">Beantragt am</dt>
                      <dd className="fs-mono">
                        {formatDay(row.requestedAt)} um {formatTime(row.requestedAt)} Uhr
                      </dd>
                      {row.decidedAt && (
                        <>
                          <dt className="fs-eyebrow">Entschieden am</dt>
                          <dd className="fs-mono">
                            {formatDay(row.decidedAt)} um {formatTime(row.decidedAt)} Uhr
                          </dd>
                        </>
                      )}
                    </dl>
                  )}
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="fs-none">
                <p className="fs-none__title">Keine Anträge mit diesem Status.</p>
                <p className="fs-none__text">Wählen Sie oben „Alle“, um wieder alles zu sehen.</p>
              </div>
            )}
          </section>
        )}

        <p className="fs-footnote">
          Das Ende zählt nicht mehr zur Freistellung: ein ganzer freier Tag geht von 00:00 bis 00:00
          des Folgetages. Für einen Zeitraum, in dem Sie bereits eine Freistellung haben, lässt sich
          keine zweite beantragen.
        </p>

        {/* Am Ende von <main>, wie der Sonstiges-Dialog: er muss erreichbar
            bleiben, unabhängig davon, welche Karte gerade offen ist. */}
        <PasswordDialog
          open={passwordOpen}
          onClose={() => setPasswordOpen(false)}
          onDone={setNotice}
        />
      </main>
    </div>
  );
}


/* CalendarIcon is only used by the empty state on this page, so it stays here;
   the icons both dashboards share live in client/src/icons.jsx. */

function CalendarIcon() {
  return (
    <svg className="fs-empty__icon" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="4.75" y="8.75" width="34.5" height="30.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.75 17.5h34.5M14 4.5v8M30 4.5v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="12" y="24" width="7" height="6" fill="currentColor" opacity=".35" />
      <rect x="24" y="24" width="7" height="6" fill="currentColor" opacity=".35" />
    </svg>
  );
}
