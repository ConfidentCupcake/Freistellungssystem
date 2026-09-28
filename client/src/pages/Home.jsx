import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { dashboardPath } from '../auth/dashboardPath.js';

// Die Startseite verteilt eingeloggte Personen ohne Zwischenschritt auf das
// zu ihrer Rolle gehörende Dashboard.
export default function Home() {
  const { user } = useAuth();
  return <Navigate to={dashboardPath(user.role)} replace />;
}
