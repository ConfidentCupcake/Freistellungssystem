# BTZ Freistellungen

Verwaltung von Freistellungen. Express 5 als JSON-API, React 19 (Vite) als Frontend, PostgreSQL als Datenbank.

## Voraussetzungen

| | |
|---|---|
| **Node.js** | 20.11 oder neuer (`node -v`) |
| **Docker Desktop** | nur für die lokale Datenbank — alternativ ein vorhandener PostgreSQL-Server |

## Einrichtung (einmalig)

```powershell
# 1. Abhängigkeiten installieren
npm install

# 2. Konfiguration anlegen
Copy-Item .env.example .env

# 3. SESSION_SECRET erzeugen und in die .env eintragen
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Datenbank starten (Docker muss laufen)
npm run db:up

# 5. Schema anlegen
npm run migrate up

# 6. Admin-Konto anlegen (Standard: admin / admin)
npm run seed
```

Ohne Schritt 3 funktioniert alles, aber bei jedem Neustart wird ein neues Sitzungsgeheimnis erzeugt und alle Anmeldungen werden ungültig.

## Starten

```powershell
npm run db:up   # falls die Datenbank nicht schon läuft
npm run dev
```

Dann **<http://localhost:5173>** öffnen und mit den Zugangsdaten aus der `.env` anmelden.

`npm run dev` startet zwei Prozesse gleichzeitig:

| Prozess | Port | Aufgabe |
|---|---|---|
| Vite | 5173 | liefert das React-Frontend aus, mit Hot Reload |
| Express | 3000 | die JSON-API, startet bei Änderungen in `bin/`, `lib/`, `routes/`, `app.js` neu |

> **Immer Port 5173 verwenden, nicht 3000.** Vite leitet alle `/api`-Anfragen an Express weiter. Dadurch bleiben Frontend und API auf derselben Herkunft und das Sitzungs-Cookie funktioniert. Port 3000 direkt liefert nur den zuletzt gebauten Stand aus `client/dist`.

Beenden mit <kbd>Strg</kbd>+<kbd>C</kbd>. Die Datenbank läuft im Hintergrund weiter — `npm run db:down` stoppt sie.

## Produktionsnaher Start

```powershell
npm run build   # baut das Frontend nach client/dist
npm start       # Express liefert API und Frontend zusammen auf Port 3000 aus
```

Hier ist **<http://localhost:3000>** die richtige Adresse; Vite läuft nicht mit. Für einen echten Betrieb zusätzlich `NODE_ENV=production` und ein gesetztes `SESSION_SECRET`.

## Alle Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Entwicklung: Vite (5173) + Express (3000) |
| `npm run build` | Frontend nach `client/dist` bauen |
| `npm start` | Server allein, liefert den gebauten Stand aus |
| `npm run db:up` | lokale PostgreSQL-Datenbank starten |
| `npm run db:down` | Datenbank stoppen (Daten bleiben erhalten) |
| `npm run migrate up` | ausstehende Migrationen anwenden |
| `npm run migrate down` | letzte Migration zurückrollen |
| `npm run migrate create <name>` | neue Migrationsdatei anlegen |
| `npm run seed` | Konto aus `LOGIN_USER`/`LOGIN_PASSWORD` anlegen bzw. Passwort zurücksetzen |

Es gibt derzeit weder Tests noch einen Linter.

## Konfiguration

Alle Einstellungen stehen in der `.env` im Projektverzeichnis. Die Datei ist **nicht** in Git; `.env.example` ist die Vorlage. Echte Umgebungsvariablen haben Vorrang vor der Datei.

| Variable | Bedeutung |
|---|---|
| `PORT` | Port des Express-Servers (Standard 3000) |
| `NODE_ENV` | `development` zeigt Fehler-Stacktraces in API-Antworten; für den Betrieb `production` |
| `DATABASE_URL` | PostgreSQL-Verbindung; Standardwert passt zur `docker-compose.yml` |
| `SESSION_SECRET` | signiert das Sitzungs-Cookie; im Betrieb zwingend erforderlich |
| `LOGIN_USER`, `LOGIN_PASSWORD` | Konto, das `npm run seed` anlegt |
| `DEBUG` | `btzfreistellungen:*` schaltet die Logausgabe in `bin/www` frei |

## Projektstruktur

```
bin/www              Startpunkt: lädt .env, startet den HTTP-Server
app.js               Express-App: Middleware, API-Router, SPA-Fallback, Fehlerbehandlung
lib/db.js            PostgreSQL-Verbindungspool
lib/auth.js          Passwort-Hashing (scrypt), Anmeldung, requireAuth/requireAdmin
routes/api/          die JSON-API, eingehängt unter /api
migrations/          Datenbankschema (node-pg-migrate)
scripts/             Hilfsskripte für Migration und Seed
client/              React-Frontend (Vite)
  src/api.js         zentrale fetch-Hilfe
  src/auth/          Sitzungszustand im Frontend, Routenschutz
  src/pages/         Seiten
public/              statische Dateien, direkt unter / erreichbar
```

Technische Details und Konventionen stehen in [CLAUDE.md](CLAUDE.md).

## Datenbank

Direkt per `psql` im Container:

```powershell
docker exec -it btz-postgres psql -U btz -d btzfreistellungen
```

Schema komplett neu aufbauen (**löscht alle Daten**):

```powershell
docker compose down -v
npm run db:up
npm run migrate up
npm run seed
```

## Wenn etwas nicht startet

| Meldung | Ursache und Lösung |
|---|---|
| `DATABASE_URL is not set` | keine `.env` vorhanden — `Copy-Item .env.example .env` |
| `ECONNREFUSED ... 5432` | Datenbank läuft nicht — `npm run db:up` |
| `relation "users" does not exist` | `npm run migrate up` fehlte oder ist fehlgeschlagen. In PowerShell bricht eine mit `;` verkettete Zeile bei einem Fehler nicht ab, der Fehler scrollt also vorbei — die Befehle einzeln ausführen |
| `error during connect ... dockerDesktopLinuxEngine` | Docker Desktop ist nicht gestartet |
| `Port 3000 is already in use` | alter Serverprozess läuft noch — Fenster schließen oder den Prozess auf Port 3000 beenden |
| Anmeldung schlägt fehl, obwohl die Zugangsdaten stimmen | `npm run seed` ausführen; Konten werden nicht beim Serverstart angelegt |
| Leere Seite auf Port 3000 | Frontend wurde noch nicht gebaut — `npm run build`, oder im Alltag Port 5173 verwenden |
| `relation "session" does not exist` | Migrationen fehlen — `npm run migrate up` |

## Stand

Anmeldung, Sitzungsverwaltung, die Benutzerverwaltung und das Schema für `freistellungen` stehen. Die eigentliche Fachlogik darauf fehlt noch: die Startseite ist ein Platzhalter, und auf `freistellungen` greift bisher nichts zu.

Unter **/admin** (nur für die Rolle `admin`, verlinkt auf der Startseite) stehen alle Benutzer und ein Formular zum Anlegen neuer Konten mit Benutzername, Passwort und Rolle. Die Auswahlliste der Rollen kommt aus dem `user_role`-Typ der Datenbank. Eine einmal vergebene Rolle lässt sich nicht mehr ändern — dafür ein neues Konto anlegen.

Vor einem echten Einsatz zu klären: `SESSION_SECRET` setzen und die Zugangsdaten aus `docker-compose.yml` durch eine betreute Datenbank ersetzen.
