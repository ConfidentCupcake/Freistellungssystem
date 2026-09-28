import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';
import { dashboardPath } from '../auth/dashboardPath.js';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <p className="page__status">Wird geladen …</p>;
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Einheitliches Login; die Rolle aus der Serverantwort bestimmt das Dashboard.
      const signedIn = await login(identifier, password);
      navigate(dashboardPath(signedIn.role), { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <h1>Anmelden</h1>
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      <form className="login__form" onSubmit={handleSubmit}>
        <label htmlFor="username">Benutzername oder E-Mail</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
        <label htmlFor="password">Passwort</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Wird angemeldet …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
