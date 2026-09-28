import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <>
      <div className="logout">
        {user.role === 'admin' && <Link to="/admin">Administration</Link>}
        {user.role === 'teilnehmer' && <Link to="/teilnehmer">Meine Freistellungen</Link>}
        <span>Angemeldet als {user.username}</span>
        <button type="button" onClick={logout}>
          Abmelden
        </button>
      </div>
      <h1>BTZ Freistellungen</h1>
      <p>Welcome to BTZ Freistellungen</p>
    </>
  );
}
