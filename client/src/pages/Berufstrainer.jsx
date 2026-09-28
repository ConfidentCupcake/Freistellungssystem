import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordDialog from '../PasswordDialog.jsx';
import { PHASE_LABELS, groupFor, phaseFor } from '../freistellungStatus.js';
import './Berufstrainer.css';

const EMPTY_USER = {
  firstName: '', lastName: '', username: '', email: '', password: '', trainingArea: ''
};

function dateTime(value) {
  return value ? new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short', timeStyle: 'short'
  }) : '—';
}

function day(value) {
  return value ? new Date(value).toLocaleDateString('de-DE') : '—';
}

function nameOf(person) {
  return [person.firstName, person.lastName].filter(Boolean).join(' ')
    || person.displayName || person.username;
}

// Die Tabellenzeile entspricht dem Aufbau „Meine Freistellungen“: Erst ein
// kompakter Überblick, dann auf Klick Einzelheiten und erlaubte Aktionen.
function RequestTable({ rows, now, expanded, toggle, notes, setNotes, busy, decide, close, openCancel }) {
  if (rows.length === 0) return <p className="trainer__empty">Keine Freistellungen in dieser Ansicht.</p>;
  return <div className="trainer__table" role="table" aria-label="Freistellungen">
    <div className="trainer__table-head" role="row">
      <span>Teilnehmername</span><span>Zeitraum</span><span>Grund</span>
      <span>Status</span><span>Beantragt</span><span aria-hidden="true" />
    </div>
    {rows.map((row) => {
      const open = !!expanded[row.id];
      const phase = phaseFor(row, now);
      return <div className="trainer__entry" key={row.id}>
        <button type="button" className="trainer__row" aria-expanded={open}
          onClick={() => toggle(row.id)}>
          <span className="trainer__person-name">{row.teilnehmerName}</span>
          <span>{dateTime(row.startDate)}<small>bis {dateTime(row.endDate)}</small></span>
          <span>{row.reason}</span>
          <span><b className={`trainer__status trainer__status--${phase}`}>
            {PHASE_LABELS[phase] || phase}</b></span>
          <span>{day(row.requestedAt)}</span>
          <span className="trainer__chevron" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
        </button>
        {open && <div className="trainer__detail">
          <dl>
            <dt>Zeitraum</dt><dd>{dateTime(row.startDate)} bis {dateTime(row.endDate)}</dd>
            <dt>Grund</dt><dd>{row.reason}</dd>
            <dt>Beantragt</dt><dd>{dateTime(row.requestedAt)}</dd>
            {row.decidedAt && <><dt>Entschieden</dt><dd>{dateTime(row.decidedAt)}</dd></>}
            {row.decisionNote && <><dt>Anmerkung</dt><dd>{row.decisionNote}</dd></>}
            {row.reportedBackAt && <><dt>Rückkehr gemeldet</dt><dd>{dateTime(row.reportedBackAt)}</dd></>}
            {row.closedAt && <><dt>Geschlossen</dt><dd>{dateTime(row.closedAt)}</dd></>}
            {row.cancelledAt && <><dt>Storniert</dt><dd>{dateTime(row.cancelledAt)}</dd></>}
            {row.cancellationReason && <><dt>Stornierungsgrund</dt><dd>{row.cancellationReason}</dd></>}
          </dl>
          {row.status === 'offen' && <div className="trainer__actions">
            <label>Anmerkung (optional)
              <textarea maxLength={1000} value={notes[row.id] || ''}
                onChange={(event) => setNotes((current) => ({
                  ...current, [row.id]: event.target.value
                }))} />
            </label>
            <button type="button" disabled={busy} onClick={() => decide(row, 'genehmigt')}>Annehmen</button>
            <button type="button" disabled={busy} onClick={() => decide(row, 'abgelehnt')}>Ablehnen</button>
          </div>}
          {row.status === 'genehmigt' && row.reportedBackAt &&
            <button type="button" disabled={busy} onClick={() => close(row)}>
              Rückkehr geprüft · schließen
            </button>}
          {['offen', 'genehmigt'].includes(row.status) &&
            <button type="button" className="trainer__danger" disabled={busy}
              onClick={() => openCancel(row)}>Stornieren</button>}
        </div>}
      </div>;
    })}
  </div>;
}

export default function Berufstrainer() {
  const { user, logout } = useAuth();
  const [view, setView] = useState('overview');
  const [people, setPeople] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(EMPTY_USER);
  const [target, setTarget] = useState({});
  const [notes, setNotes] = useState({});
  const [expanded, setExpanded] = useState({});
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [historyPerson, setHistoryPerson] = useState(null);
  const [cancellation, setCancellation] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const historyDialog = useRef(null);
  const cancelDialog = useRef(null);

  const reload = useCallback(async () => {
    const [participants, colleagues, freistellungen] = await Promise.all([
      api('/berufstrainer/teilnehmer'), api('/berufstrainer/kollegen'),
      api('/berufstrainer/freistellungen')
    ]);
    setPeople(participants.teilnehmer);
    setTrainers(colleagues.berufstrainer);
    setRequests(freistellungen.freistellungen);
    setNow(Date.now());
  }, []);

  useEffect(() => { reload().catch((err) => setError(err.message)); }, [reload]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // Rückmeldungen und neue Anträge anderer Nutzer erscheinen auch ohne
    // erneuten Seitenaufruf im Überblick.
    const timer = setInterval(() => reload().catch((err) => setError(err.message)), 60000);
    return () => clearInterval(timer);
  }, [reload]);

  // Das Dashboard zeigt ausschließlich Offen und Pending. Genehmigte
  // zukünftige Termine stehen im Teilnehmerverlauf, nicht in dieser Übersicht.
  const overview = useMemo(() => requests.filter((request) =>
    request.status === 'offen' || groupFor(request, now) === 'pending'
  ), [requests, now]);

  function recentFor(personId, all = false) {
    const rows = requests.filter((row) => row.userId === personId)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    return all ? rows : rows.slice(0, 5);
  }

  function toggle(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  async function perform(action, message) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice(message);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createParticipant(event) {
    event.preventDefault();
    const success = await perform(
      () => api('/berufstrainer/teilnehmer', { body: form }),
      'Teilnehmer wurde erstellt und Ihnen zugewiesen.'
    );
    if (success) {
      setForm(EMPTY_USER);
      setView('participants');
    }
  }

  async function transfer(person) {
    if (!window.confirm(`${nameOf(person)} an einen anderen Berufstrainer übertragen?`)) return;
    await perform(() => api(`/berufstrainer/teilnehmer/${person.id}/zuweisung`, {
      method: 'PUT', body: { berufstrainerId: target[person.id] }
    }), 'Teilnehmer und vollständige Historie wurden übertragen.');
  }

  async function decide(row, status) {
    await perform(() => api(`/berufstrainer/freistellungen/${row.id}/entscheidung`, {
      method: 'PUT', body: { status, note: notes[row.id] || '' }
    }), 'Entscheidung gespeichert.');
  }

  async function close(row) {
    await perform(() => api(`/berufstrainer/freistellungen/${row.id}/schliessen`, {
      method: 'PUT'
    }), 'Freistellung geschlossen.');
  }

  function openCancel(row) {
    setCancellation(row);
    setCancelReason('');
    setError(null);
    cancelDialog.current?.showModal();
  }

  async function confirmCancellation(event) {
    event.preventDefault();
    if (!cancellation || !cancelReason.trim()) return;
    const success = await perform(() => api(
      `/berufstrainer/freistellungen/${cancellation.id}/stornieren`, {
        method: 'PUT', body: { reason: cancelReason.trim() }
      }), 'Freistellung mit Begründung storniert.');
    if (success) {
      cancelDialog.current?.close();
      setCancellation(null);
    }
  }

  function requestTable(rows) {
    return <RequestTable rows={rows} now={now} expanded={expanded} toggle={toggle}
      notes={notes} setNotes={setNotes} busy={busy} decide={decide}
      close={close} openCancel={openCancel} />;
  }

  return <div className="trainer">
    <aside className="trainer__sidebar" aria-label="Berufstrainer-Menü">
      <div className="trainer__brand">BTZ <span>Freistellungen</span></div>
      {/* Oben links, getrennt von <nav>: die Knöpfe dort wechseln die Ansicht,
          dieser öffnet einen Dialog und gehört nicht in dieselbe Gruppe. */}
      <button type="button" className="trainer__password"
        onClick={() => setPasswordOpen(true)}>Passwort ändern</button>
      <nav>
        <button type="button" className={view === 'overview' ? 'is-active' : ''}
          onClick={() => setView('overview')}>Übersicht</button>
        <button type="button" className={view === 'create' ? 'is-active' : ''}
          onClick={() => setView('create')}>Teilnehmer erstellen</button>
        <button type="button" className={view === 'participants' ? 'is-active' : ''}
          onClick={() => setView('participants')}>Teilnehmer</button>
      </nav>
      <div className="trainer__account">
        <span>{user.displayName || user.username}</span>
        <button type="button" onClick={logout}>Abmelden</button>
      </div>
    </aside>

    <main className="trainer__main">
      {error && <p className="trainer__error" role="alert">{error}</p>}
      {notice && <p className="trainer__notice" role="status">{notice}</p>}

      {view === 'overview' && <section>
        <div className="trainer__heading">
          <h1>Offene und laufende Freistellungen</h1>
          <p>Neue Anträge und Termine, bei denen noch eine Rückmeldung oder Prüfung aussteht.</p>
          <button type="button" onClick={() => reload().catch((err) => setError(err.message))}>
            Aktualisieren
          </button>
        </div>
        {requestTable(overview)}
      </section>}

      {view === 'create' && <section className="trainer__create">
        <div className="trainer__heading">
          <h1>Teilnehmer erstellen</h1>
          <p>Der neue Teilnehmer wird automatisch Ihnen zugewiesen.</p>
        </div>
        <form onSubmit={createParticipant} className="trainer__form">
          <label>Vorname<input required maxLength={100} value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label>Nachname<input required maxLength={100} value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          <label>Benutzername<input required value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>E-Mail (optional)<input type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Passwort<input required type="password" autoComplete="new-password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Ausbildungsbereich<input required maxLength={150} value={form.trainingArea}
            onChange={(e) => setForm({ ...form, trainingArea: e.target.value })} /></label>
          <button type="submit" disabled={busy}>Teilnehmer erstellen</button>
        </form>
      </section>}

      {view === 'participants' && <section>
        <div className="trainer__heading">
          <h1>Meine Teilnehmer</h1>
          <p>{people.length} zugewiesene Teilnehmer · Name anklicken für die letzten fünf Anträge.</p>
        </div>
        <div className="trainer__people">
          {people.length === 0 && <p>Keine Teilnehmer zugewiesen.</p>}
          {people.map((person) => {
            const history = recentFor(person.id, true);
            const active = history.some((row) => !['abgelehnt', 'geschlossen', 'storniert'].includes(row.status));
            return <article className="trainer__person" key={person.id}>
              <div className="trainer__person-line">
                <button type="button" className="trainer__name-button"
                  aria-expanded={expandedPerson === person.id}
                  onClick={() => setExpandedPerson(expandedPerson === person.id ? null : person.id)}>
                  {nameOf(person)} <span>{expandedPerson === person.id ? '⌃' : '⌄'}</span>
                </button>
                <span>{person.email || 'Keine E-Mail'}</span>
                <span>{person.trainingArea || 'Bereich noch nicht angegeben'}</span>
                {history.length > 5 && <button type="button" onClick={() => {
                  setHistoryPerson(person.id);
                  historyDialog.current?.showModal();
                }}>Verlauf ({history.length})</button>}
              </div>
              {expandedPerson === person.id && <div className="trainer__person-detail">
                <h2>{nameOf(person)} · letzte fünf Freistellungen</h2>
                {requestTable(recentFor(person.id))}
                <div className="trainer__transfer">
                  <label>Teilnehmer übertragen
                    <select value={target[person.id] || ''} onChange={(e) =>
                      setTarget({ ...target, [person.id]: e.target.value })}>
                      <option value="">Berufstrainer auswählen …</option>
                      {trainers.filter((trainer) => trainer.id !== user.id).map((trainer) =>
                        <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy || active || !target[person.id]}
                    onClick={() => transfer(person)}>Übertragen</button>
                  {active && <small>Erst alle offenen und laufenden Anträge abschließen oder stornieren.</small>}
                </div>
              </div>}
            </article>;
          })}
        </div>
      </section>}
    </main>

    <dialog className="trainer__dialog trainer__history" ref={historyDialog}
      onClose={() => setHistoryPerson(null)} aria-label="Vollständiger Freistellungsverlauf">
      <div className="trainer__dialog-head">
        <h2>{nameOf(people.find((person) => person.id === historyPerson) || { username: '' })}
          {' '}· Freistellungsverlauf</h2>
        <button type="button" onClick={() => historyDialog.current?.close()}>Schließen</button>
      </div>
      {historyPerson != null && requestTable(recentFor(historyPerson, true))}
    </dialog>

    <dialog className="trainer__dialog trainer__cancel" ref={cancelDialog}
      onClose={() => setCancellation(null)} aria-label="Freistellung stornieren">
      <h2>Freistellung stornieren</h2>
      <p>Der Antrag bleibt mit dem Stornierungsgrund in der Historie sichtbar.</p>
      <form onSubmit={confirmCancellation}>
        <label>Grund für die Stornierung
          <textarea required maxLength={500} autoFocus value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)} />
        </label>
        <div className="trainer__dialog-buttons">
          <button type="button" onClick={() => cancelDialog.current?.close()}>Abbrechen</button>
          <button type="submit" className="trainer__danger" disabled={busy || !cancelReason.trim()}>
            Stornierung bestätigen
          </button>
        </div>
      </form>
    </dialog>

    {/* Neben den eigenen Dialogen dieser Seite, obwohl er die .fs-dialog-Optik
        mitbringt: styles.css lädt main.jsx global, und das Formular ist
        wortgleich das von /teilnehmer. */}
    <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)}
      onDone={(message) => { setError(null); setNotice(message); }} />
  </div>;
}
