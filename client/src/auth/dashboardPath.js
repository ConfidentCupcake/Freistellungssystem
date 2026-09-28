// Nach der Anmeldung bestimmt ausschließlich die gespeicherte Rolle das Ziel.
export function dashboardPath(role) {
  return { admin: '/admin', berufstrainer: '/berufstrainer', teilnehmer: '/teilnehmer' }[role] || '/login';
}
