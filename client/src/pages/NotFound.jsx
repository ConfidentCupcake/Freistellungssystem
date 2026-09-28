import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <>
      <h1>Seite nicht gefunden</h1>
      <p>
        <Link to="/">Zur Startseite</Link>
      </p>
    </>
  );
}
