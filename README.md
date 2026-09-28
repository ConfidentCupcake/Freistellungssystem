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

`npm run db:down` allein reicht dafür nicht: ohne `-v` bleibt das Volume `pgdata` mit dem alten Schema bestehen.

### Migrationen niemals nachträglich ändern

**Eine Migration, die schon einmal committet wurde, wird nicht mehr bearbeitet.** Jede Schemaänderung kommt in eine *neue* Datei (`npm run migrate create <name>`).

node-pg-migrate merkt sich in der Tabelle `pgmigrations` nur den **Dateinamen**, keine Prüfsumme des Inhalts. Wird eine bereits angewendete Datei geändert, sieht `npm run migrate up` sie weiterhin als erledigt an und überspringt sie. Folge: Wer die Datenbank vor der Änderung angelegt hat, behält das alte Schema — dauerhaft und ohne Fehlermeldung. Nur frisch aufgesetzte Datenbanken bekommen den neuen Stand, und dann laufen zwei Maschinen mit unterschiedlichem Schema auf demselben Code. Genau so ist der Enum `user_role` auf manchen Maschinen nie entstanden, während `role` dort noch eine `text`-Spalte ist.

Schemastand einer Maschine prüfen:

```powershell
docker exec btz-postgres psql -U btz -d btzfreistellungen `
  -c "SELECT name, run_on FROM pgmigrations ORDER BY id;" `
  -c "\dT user_role" `
  -c "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name='users';"
```

Stehen alle Migrationen als angewendet in `pgmigrations`, `\dT user_role` liefert aber nichts oder `users.role` ist `text` statt `user_role`, ist die Datenbank auseinandergelaufen. Auf einer Entwicklungsmaschine ist der schnellste Weg der komplette Neuaufbau oben. Müssen die Daten erhalten bleiben, hilft nur eine neue Migration, die den Unterschied nachzieht (`ALTER TABLE ... TYPE user_role USING role::text::user_role` und so weiter) — dafür zuerst den Ist-Zustand mit dem Befehl oben erfassen.

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
| `type "user_role" does not exist`, oder `/api/users/roles` antwortet mit 500 (die Rollenauswahl unter `/admin` bleibt leer) | Die Datenbank ist älter als eine nachträglich geänderte Migration und wurde deshalb nie aktualisiert — siehe [Migrationen niemals nachträglich ändern](#migrationen-niemals-nachträglich-ändern) |

## Stand

Anmeldung, Sitzungsverwaltung, die Benutzerverwaltung und das Schema für `freistellungen` stehen. Die eigentliche Fachlogik darauf fehlt noch: die Startseite ist ein Platzhalter, und auf `freistellungen` greift bisher nichts zu.

Unter **/admin** (nur für die Rolle `admin`, verlinkt auf der Startseite) stehen alle Benutzer und ein Formular zum Anlegen neuer Konten mit Benutzername, Passwort und Rolle. Die Auswahlliste der Rollen kommt aus dem `user_role`-Typ der Datenbank. Eine einmal vergebene Rolle lässt sich nicht mehr ändern — dafür ein neues Konto anlegen.

Vor einem echten Einsatz zu klären: `SESSION_SECRET` setzen und die Zugangsdaten aus `docker-compose.yml` durch eine betreute Datenbank ersetzen.
