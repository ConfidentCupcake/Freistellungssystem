/*
 * The reasons offered in the Freistellung request form.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE LIST TO EDIT. The entries below are PLACEHOLDERS — replace them
 * with the real ones. Nothing else needs changing: the dropdown on
 * /teilnehmer renders whatever stands here, in this order.
 * ---------------------------------------------------------------------------
 *
 * The label is what gets stored. `freistellungen.reason` is a plain text
 * column, so there is no migration to run when this list changes, and rows
 * filed earlier keep the wording they were filed under — which is what you
 * want from a record of what somebody actually asked for.
 *
 * The API only insists that a reason is not empty; it does not check it
 * against this list. Move the list behind an endpoint (the way
 * GET /api/users/roles serves the role dropdown) if that ever has to be
 * enforced, or if the reasons should be editable without a rebuild.
 */
export const REASONS = [
  'Arzttermin',
  'Therapietermin',
  'Behördentermin',
  'Termin im Jobcenter',
  'Vorstellungsgespräch',
  'Betriebspraktikum',
  'Familiäre Verpflichtung',
  'Umzug',
  'Erkrankung'
];

/*
 * The last entry in the dropdown, and deliberately NOT part of REASONS above:
 * picking it opens a dialog and what the Teilnehmer types there is stored as
 * the reason, so this label never reaches the database. Keeping it out of the
 * list is what stops it being treated as a reason in its own right — leave it
 * out when you replace the entries above.
 */
export const OTHER_REASON = 'Sonstiges';
