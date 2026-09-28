/*
 * Date formatting shared by the dashboards. Both render German dates, and both
 * have to turn a missing timestamp into an em dash rather than "Invalid Date" —
 * `users.created_at` is only selected by some queries, and a Freistellung has
 * no `decidedAt` until somebody decides.
 *
 * The Intl.DateTimeFormat instances are built once at module load: constructing
 * one is the expensive part, and a list re-renders these for every row.
 *
 * Both format in the *browser's* timezone, which is what a reader expects to
 * see. Anything sent back the other way is converted in the page that sends it
 * (see toIso in Teilnehmer.jsx).
 */

const dayFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function formatDay(value) {
  return value ? dayFormat.format(new Date(value)) : '—';
}

export function formatTime(value) {
  return value ? timeFormat.format(new Date(value)) : '—';
}
