# Stagebeheertool (Team 7)

Een webapplicatie voor het beheren van stages binnen een hogeschoolcontext.
Studenten, docenten, stagementoren, de stagecommissie en de administratie werken
in één tool samen rond stagevoorstellen, logboeken, evaluaties en documenten voor
ondertekeningen.

## Functionaliteit
De applicatie kent vijf rollen, elk met een eigen omgeving. Gebruikers krijgen op basis van hun inloggegevens automatisch de gepaste rol. Een docent kan daarnaast ook de rol hebben van stagecommissie of admin.



| Rol | Mogelijkheden |
|-----|---------------|
| Student | Stagevoorstel indienen, Eigen stage bekijken, logboeken bijhouden en indienen, zelfevaluatie invullen, documenten/ondertekeningen beheren |
| Docent | Toegewezen studenten opvolgen, logboeken nakijken, evaluaties invullen, evaluatiefases activeren en eindevaluaties genereren |
| Stagementor | Studenten begeleiden, logboeken aftekenen, evaluaties invullen, documenten bekijken/ondertekeningen doen |
| Stagecommissie | Stagevoorstellen beoordelen (accepteren/weigeren/aanpassingen vragen) |
| Administratie | Accountbeheer, competentiebeheer en stagebeheer (stages koppelen en bewerken) |

## Technologie

- Frontend: Vue 3 (Composition API) + Vue Router, gebouwd met Vite
- Backend: Node.js + Express (ES modules)
- Database: Supabase (PostgreSQL)
- Authenticatie: JWT (`jsonwebtoken`) + wachtwoord-hashing met `bcrypt`
- Overig: `multer` (bestandsupload), `pdfkit` (PDF-generatie)

## Projectstructuur

```
CodeCollection/
├── client/                 # Vue-frontend
│   ├── src/
│   │   ├── views/          # Pagina's per rol (student, docent, stagementor,
│   │   │                   #   stagecommissie, administratie, shared)
│   │   ├── components/
│   │   ├── router/         # Routedefinities (vue-router)
│   │   └── assets/
│   └── vite.config.js      # Dev-server + proxy /api -> backend
└── server/                 # Express-backend
    ├── index.js            # Entry point, mount van alle routes
    └── routes/
        ├── auth.js
        ├── admin/          # admin-routes, competenties, stagebeheer
        ├── *.routes.js     # routes per rol (docent, stagementor, ...)
        └── ...
```


## Installatie & opstarten

Op de wifi van EHB of met de EHB VPN kan je de website bekijken op [http://10.2.160.248:5173](http://10.2.160.248:5173) .

Alternatief kan je het locaal laten draaien:
De applicatie bestaat uit twee delen die je apart start: de backend en de
frontend.

### 1. Backend

```bash
cd CodeCollection/server
npm install
# maak een .env-bestand aan (zie Omgevingsvariabelen)
npm run dev          # start op http://localhost:3000
```

### 2. Frontend

```bash
cd CodeCollection/client
npm install
npm run dev        # start op http://localhost:5173
```

De Vite-dev-server stuurt alle `/api`-aanvragen automatisch door naar de backend
op poort 3000 (zie `client/vite.config.js`), dus je hoeft daar niets voor in te
stellen.

Open daarna [http://localhost:5173](http://localhost:5173) in je browser.

## Omgevingsvariabelen

Maak in `CodeCollection/server` een bestand `.env` met:

| Variabele | Beschrijving |
|-----------|--------------|
| `SUPABASE_URL` | De URL van je Supabase-project |
| `SUPABASE_SERVICE_KEY` | De service-role key van Supabase (server-side) |
| `JWT_SECRET` | Geheime sleutel voor het ondertekenen van JWT-tokens |
| `PORT` | (optioneel) Poort voor de backend, standaard `3000` |

> Commit je `.env` nooit naar git.

## API-overzicht

Alle endpoints staan onder `/api`. Globale opdeling per prefix:

| Prefix | Doel |
|--------|------|
| `/api/auth` | Inloggen en authenticatie |
| `/api/student` | Student-evaluaties |
| `/api/studentlogboeken` | Logboeken |
| `/api/docent` | Docent: studenten en evaluaties |
| `/api/stagementor` | Stagementor: studenten en evaluaties |
| `/api/stagecommissie` | Stagevoorstellen beoordelen |
| `/api/stagevoorstellen` | Stagevoorstellen indienen |
| `/api/admin` | Accountbeheer, competentiebeheer, stagebeheer |

## Database

De data staat in Supabase (PostgreSQL). Belangrijkste tabellen:

- gebruikers — accounts (naam, e-mail, wachtwoord-hash, opleiding)
- gebruiker_rollen — koppeltabel die rollen aan gebruikers koppelt
  (meerdere rollen per gebruiker mogelijk)
- gebruiker_opleidingen — koppeltabel gebruiker ↔ opleiding
- opleidingen — opleidingen
- stagevoorstellen — bedrijfsgegevens, beschrijving, skills, adres
- stages — koppelt student, docent en stagementor aan een voorstel, met
  status en periode
- logboeken + competenties_logboeken — wekelijkse logboeken en hun competenties
- competenties — leerdoelen/competenties per opleiding
- evaluaties — scores en feedback per competentie en stage
- stageovereenkomsten — geüploade overeenkomst-documenten


<img width="1693" height="2860" alt="erd_gecorrigeerd (1)" src="https://github.com/user-attachments/assets/84dd6e60-53aa-4bae-8bf9-f617511b992c" />

