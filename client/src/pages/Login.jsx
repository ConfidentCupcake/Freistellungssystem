import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // One field for both ways in: a username or an e-mail address. The server
  // decides which it is, so nothing here has to guess.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Where RequireAuth bounced the visitor from, defaulting to the home page.
  const returnTo = location.state?.from?.pathname || '/';

  if (loading) return <p className="page__status">Wird geladen …</p>;
  if (user) return <Navigate to={returnTo} replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(identifier, password);
      navigate(returnTo, { replace: true });
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
        {/* type="text", not "email": the same field also takes a plain
            username, which the browser's e-mail validation would reject. */}
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
