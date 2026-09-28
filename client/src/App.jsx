import { Route, Routes } from 'react-router-dom';

import RequireAuth from './auth/RequireAuth.jsx';
import Admin from './pages/Admin.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Teilnehmer from './pages/Teilnehmer.jsx';
import Berufstrainer from './pages/Berufstrainer.jsx';

export default function App() {
  // Die Zugriffskontrolle im Client lenkt zur passenden Ansicht; alle
  // Schreibrechte kontrolliert zusätzlich die Express-API.
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth role="admin">
            <Admin />
          </RequireAuth>
        }
      />
      <Route
        path="/berufstrainer"
        element={<RequireAuth role="berufstrainer"><Berufstrainer /></RequireAuth>}
      />
      <Route
        path="/teilnehmer"
        element={
          <RequireAuth role="teilnehmer">
            <Teilnehmer />
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
