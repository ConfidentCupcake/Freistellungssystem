import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext.jsx';

// Client-side counterpart to lib/auth.js `requireAuth`. It replaces the old
// server-side redirect, including remembering where the visitor was headed.
//
// With a `role` it also mirrors `requireAdmin`: a signed-in visitor without that
// role is told so instead of being bounced to /login, which would only loop —
// they are logged in, just not allowed. The API enforces this regardless; this
// is only about not showing a screen that would fail on every request.

// Plural names for the refusal below. A role the database knows but this map
// does not still gets a usable sentence, so adding one to the user_role enum
// needs no change here.
const ROLE_LABELS = {
  admin: 'Administratoren',
  berufstrainer: 'Berufstrainer',
  teilnehmer: 'Teilnehmer'
};

export default function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page__status">Wird geladen …</p>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user.role !== role) {
    return <p className="page__status">Diese Seite ist nur für {ROLE_LABELS[role] || role}.</p>;
  }

  return children;
}
