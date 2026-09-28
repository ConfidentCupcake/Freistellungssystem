import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { OTHER_REASON, REASONS } from '../reasons.js';

// `reason` is what the dropdown shows and `customReason` what was typed into
// the Sonstiges dialog; only one of them is ever sent (see handleSubmit).
// `assignedBerufstrainerId` is deliberately allowed to stay empty: the column
// is NULL until somebody is put on the case, so the dropdown offers that too.
const EMPTY_FORM = {
  startDate: '',
  endDate: '',
  reason: '',
  customReason: '',
  assignedBerufstrainerId: ''
};

// The status values come from the CHECK constraint on freistellungen.status.
// An unknown one falls back to the raw value rather than rendering nothing.
const STATUS_LABELS = {
  offen: 'Offen',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  geschlossen: 'Geschlossen'
};

// 'alle' is not a status — it is the unfiltered view, and the first chip.
const FILTERS = [
  { key: 'alle', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'genehmigt', label: 'Genehmigt' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
  { key: 'geschlossen', label: 'Geschlossen' }
];

const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function formatDay(value) {
  return value ? dayFormat.format(new Date(value)) : '—';
}

function formatTime(value) {
  return value ? timeFormat.format(new Date(value)) : '—';
}

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

// A row's headline: a release that starts and ends on the same calendar day
// says that date once instead of repeating it.
function formatRange(start, end) {
  const from = formatDay(start);
  const to = formatDay(end);

  return from === to ? from : `${from} – ${to}`;
}

// A datetime-local field hands back a local wall-clock string with no offset.
// Turning it into an ISO string here means the server stores the instant the
// user actually meant, whatever timezone it runs in.
function toIso(value) {
  return new Date(value).toISOString();
}

export default function Teilnehmer() {
  const { user, logout } = useAuth();

  const [freistellungen, setFreistellungen] = useState([]);
  // Fills the assignee dropdown. Ids and names only — that is all the API hands
  // a non-admin.
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [filter, setFilter] = useState('alle');
  const [expandedId, setExpandedId] = useState(null);

  // The form is hidden behind a button: the list is what the page is for, and
  // filing a request is the occasional action.
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // The Sonstiges dialog. `dialogText` is the draft — it only becomes
  // form.customReason once the dialog is confirmed, so cancelling leaves the
  // form untouched. `reasonBeforeDialog` is where the dropdown falls back to if
  // the dialog is dismissed without a reason ever being given.
  const dialogRef = useRef(null);
  const reasonBeforeDialog = useRef('');
  const [dialogText, setDialogText] = useState('');

  useEffect(() => {
    let cancelled = false;

    Promise.all([api('/freistellungen'), api('/freistellungen/berufstrainer')])
      .then(([list, people]) => {
        if (cancelled) return;
        setFreistellungen(list.freistellungen);
        setTrainers(people.berufstrainer);
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
    const tally = { alle: freistellungen.length };
    freistellungen.forEach((row) => {
      tally[row.status] = (tally[row.status] || 0) + 1;
    });
    return tally;
  }, [freistellungen]);

  const visible = useMemo(
    () => (filter === 'alle' ? freistellungen : freistellungen.filter((row) => row.status === filter)),
    [freistellungen, filter]
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
    // showModal() throws if the dialog is already open.
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }

  // Choosing Sonstiges is not a reason by itself — it is a request for the
  // dialog, which supplies one.
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

  // Runs for every way out of the dialog — the Abbrechen button, Esc, and the
  // close() that confirmReason itself calls. It queues after confirmReason's
  // update, so by the time it reads customReason a confirmed reason is already
  // there and the dropdown keeps Sonstiges. Without one, the dropdown goes back
  // to whatever it showed before, rather than sitting on an empty Sonstiges.
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

  async function handleSubmit(event) {
    event.preventDefault();

    // What gets stored is the reason itself, never the word "Sonstiges".
    const reason = form.reason === OTHER_REASON ? form.customReason.trim() : form.reason;

    // The dialog will not confirm an empty reason and reverts the dropdown when
    // dismissed, so this should be unreachable — it just refuses to send a
    // request with no reason rather than trusting that.
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
          assignedBerufstrainerId: form.assignedBerufstrainerId || null
        }
      });

      // The server decides the order (and the status), so the list is reloaded
      // rather than patched with the new row.
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
                  {/* The options live in client/src/reasons.js — that is the
                      one place to edit them. */}
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

                  {/* Re-picking Sonstiges fires no change event, so reopening
                      the dialog needs its own way in. */}
                  {form.reason === OTHER_REASON && form.customReason && (
                    <p className="fs-custom">
                      <span className="fs-custom__text">{form.customReason}</span>
                      <button type="button" className="fs-custom__edit" onClick={openReasonDialog}>
                        Ändern
                      </button>
                    </p>
                  )}
                </div>

                <div className="fs-field">
                  <label className="fs-eyebrow" htmlFor="trainer">
                    Berufstrainer (optional)
                  </label>
                  <select
                    id="trainer"
                    name="assignedBerufstrainerId"
                    className="fs-input fs-select"
                    value={form.assignedBerufstrainerId}
                    onChange={updateField('assignedBerufstrainerId')}
                  >
                    <option value="">Noch nicht zugewiesen</option>
                    {trainers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
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

            {/* A sibling of the request form, not a child: nesting one form
                inside another is invalid, and this one has its own. */}
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
                        {STATUS_LABELS[row.status] || row.status}
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
      </main>
    </div>
  );
}

/* Icons are drawn rather than set in a glyph font, so they scale and take their
   colour from the element they sit in. */

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.6v10.8M1.6 7h10.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.4" y="1.4" width="13.2" height="13.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v4M8 11.2v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.4" y="1.4" width="13.2" height="13.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.4 8.3l2.5 2.5 4.7-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5l4.5 4.5L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
