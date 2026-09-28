// „Bei Termin“ entsteht automatisch zur Startzeit oder durch die optionale
// Unterwegs-Meldung. „Zurück“ wartet auf die Bestätigung des Trainers.
export function phaseFor(row, now = Date.now()) {
  if (row.status !== 'genehmigt') return row.status;
  if (row.reportedBackAt) return 'zurueck';
  return row.onWayAt || new Date(row.startDate).getTime() <= now
    ? 'bei_termin' : 'genehmigt';
}

export const PHASE_LABELS = {
  offen: 'Offen',
  genehmigt: 'Angenommen',
  bei_termin: 'Pending · bei Termin',
  zurueck: 'Pending · zurück vom Termin',
  abgelehnt: 'Abgelehnt',
  storniert: 'Storniert',
  geschlossen: 'Geschlossen'
};

export function groupFor(row, now = Date.now()) {
  const phase = phaseFor(row, now);
  return phase === 'bei_termin' || phase === 'zurueck' ? 'pending' : phase;
}

export const FILTERS = [
  { key: 'alle', label: 'Alle' },
  { key: 'offen', label: 'Offen' },
  { key: 'genehmigt', label: 'Angenommen' },
  { key: 'pending', label: 'Pending' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
  { key: 'storniert', label: 'Storniert' },
  { key: 'geschlossen', label: 'Geschlossen' }
];
