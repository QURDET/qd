# Qur'an Detectives (QD)

Website for **Qur'an Detectives** and its card game **Shia Deal**, with a staff admin panel and a members portal.

## Hosting & deployment

The site is hosted on **Cloudflare Pages**.

- Every push to `main` deploys automatically.
- Static pages are served straight from the repo root.
- The API runs as a Cloudflare Pages Function (`functions/api/[[route]].js`).
- Data is stored in Cloudflare KV, bound as `QD_DATA`.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Qur'an Detectives home page |
| `shiadeal.html` | Shia Deal game page (shop link, collection info) |
| `shiadealpage.html` | Redirect to the Shia Deal page |
| `playshiadeal.html` | Play Shia Deal in the browser: vs AI, local pass-and-play, or online multiplayer (room codes, peer-to-peer via PeerJS; the host's browser runs the game) |
| `sdrescources.html` | Shia Deal resources (rules, printables) |
| `contactus.html` | Contact form |
| `members.html` | Members portal (Google / member login) |
| `admin.html` | Staff panel (inventory, contacts, users, members) |
| `sitemaintenance.html` | Site maintenance tools for admins |
| `404.html` | Page-not-found page |

## Assets

- `cards/`: Shia Deal card images. The prefix shows the card type: `action_`, `money_`, `property_`, `rent_`, `wild_`.
- `backface (TO PRINT on Back of ALL cards).pdf`: the print-ready back of every card.
- `Bely Display.ttf`: the site font.
- `.jpg`, `.jpeg` and `.PNG` files in the repo root: logos, banners and product photos.

## API

All routes live under `/api/`. Main endpoints:

- `GET /api/health`
- `GET` / `PUT /api/inventory`
- `GET` / `PUT /api/users`
- `POST /api/login`
- `POST /api/contact`, then `GET /api/contacts` and `PUT` / `DELETE /api/contacts/:id`
- `POST /api/member-login` and `POST /api/member-google-login`
- `GET` / `PUT /api/members`
- `POST /api/reset`

## Local development

`server.js` is an Express server that mirrors the API for local testing. It stores data in a `data.json` file, which is git-ignored.

```bash
npm install
npm start
```

Then open http://localhost:3000.

For local testing, set passwords with the `ADMIN_PASSWORD` and `STAFF_PASSWORD` environment variables.

## Workflow

Commit directly to `main`. Cloudflare picks up the change and redeploys within a minute or two.
