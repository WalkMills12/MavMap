# MavMap

Campus navigator for the University of Texas at Arlington. Search buildings by name or MyMav abbreviation, open walking directions in Apple or Google Maps, and see event-driven traffic heat from [events.uta.edu](https://events.uta.edu/).

## Stack

- **Frontend:** React + Vite + Google Maps JavaScript API
- **Backend:** Python FastAPI
- **Events:** UTA Localist public API (`/api/2/events`)

## Quick start

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Add VITE_GOOGLE_MAPS_API_KEY (Maps JavaScript API + Maps Visualization)
npm install
npm run dev
```

App: http://localhost:5173

Vite proxies `/api/*` to the FastAPI server on port 8000.

### Google Maps key

1. Create a key in Google Cloud Console
2. Enable **Maps JavaScript API** and **Maps Visualization**
3. Put it in `frontend/.env` as `VITE_GOOGLE_MAPS_API_KEY`

Without a key, the UI still loads a searchable building list fallback.

### Backend Google key (building photos and GPS walking routes)

Copy `backend/.env.example` to `backend/.env` and set `GOOGLE_MAPS_API_KEY` (it can be the same key). Enable **Places API (New)** and **Routes API** on it. Restart the backend after changing `.env`.

Without it, cards show colored badges instead of photos and GPS navigation draws a straight line with an estimated walking time.

## Search

The top search bar (and the Directory filter) takes anything, not just building names:

- **What you need:** `basketball` finds College Park Center, the MAC and the PE Building; `printing` finds the Central Library; `coffee`, `boba`, `parking`, `dorm` work too. These come from each place's `keywords` in `data/buildings.json`.
- **Building codes:** official UTA codes from the facilities building inventory (Feb 2023) come first in each place's `abbr` (`PKH` Pickard Hall, `PH` Preston Hall, `LIBR` Library, `UA` Administration, `ARHL` Arlington Hall…). Older aliases like `LIB` still work. Places without a code have a `short` name ("Park North", "Panda") used on cards and in search.
- **Typos:** misspelled words are matched by spelling and sound, so `kumpouter` searches for *computer* and `libary` for *library*. The dropdown says what it searched for.
- **Events:** matching upcoming events are listed under the places.

## Building details

Clicking a place opens its panel with a `description` (what it is) and `offers` ("What's here") from `data/buildings.json`, plus live open/closed, today's hours, website and phone from its Google Maps listing (`GET /api/buildings/{id}/info`, cached 30 minutes). Several academic buildings still have generic descriptions; edit those entries to add specifics.

## Building photos

Each place's `place_id` in `data/buildings.json` points at its Google Maps listing; the backend serves that listing's photo with the photographer credit Google requires. To refresh the matches (for example after adding a building):

```bash
cd backend
.venv/Scripts/python -m scripts.find_place_ids --dry-run   # review
.venv/Scripts/python -m scripts.find_place_ids             # write place_id values
```

The script only accepts a Google listing that is near the building and shares a distinctive word with its name, so a place never gets a photo of the building next door. Places without a match show a colored badge. To use your own photo, add `"image": "https://…"` to the place.

Building positions for the original academic buildings now come from OpenStreetMap outlines (see each entry's `source`).

## Live events and GPS

- Events come from **events.uta.edu** (Localist) and **MavEngage** (mavengage.uta.edu, Campus Labs Engage). MavEngage is read through the same public, no-login search its own Events page uses, so only events it shows to everyone appear. Events posted on both sites show once. The Events tab has an All / UTA Events / MavEngage switch, and MavEngage cards show the hosting organization. Postings that run for days (ticket sales, donation drives) show as all-day events "through" their last day.
- Events refresh every minute (and when you come back to the tab). The Events tab shows when it last updated, and cards are marked **Live now** or **Starting soon**.
- The ◎ button on the map shows your location. **Walk here with live GPS** in a building's panel draws the walking route and keeps it updated as you move, with time and distance in the banner at the top.
- Browsers only share location on `https://` pages or `http://localhost`. To use GPS from a phone, MavMap has to be served over https (below).

### Mobile version

On phone-sized screens MavMap switches to a mobile layout: full-screen map, a compact header with search, a bottom tab bar (Map · Places · Events · Transit), and a bottom sheet you can drag between half and full height (drag down to close). It can be installed to the home screen (`frontend/public/manifest.webmanifest` + icons): in Chrome on Android use **Install app** / **Add to Home screen**, on iPhone Safari use **Share → Add to Home Screen**.

### Walking routes end at the door

Routing to a building's center point made Google send people to whatever street or path was nearest the middle of the footprint, often the back of the building. `GET /api/route?building=<id>` instead tries the building's nearest mapped **door** and the **side of the building facing you** (from `data/entrances.json`: OpenStreetMap entrance nodes and simplified outlines for 52 buildings, 24 with doors) and keeps the shorter walk, preferring a real door unless the side is 40+ m shorter. The app draws the last steps from the walkway to the door (dotted) with a door marker, frames the whole walk on screen zoomed in enough to show campus walkways, and hides shuttle lines while you walk.

To refresh doors/outlines after OpenStreetMap edits (run from the repo root), then restart the backend:

```bash
backend/.venv/Scripts/python backend/scripts/osm_doors.py . doors.json
backend/.venv/Scripts/python backend/scripts/osm_entrances.py . doors.json   # rewrites data/entrances.json
```

### Smooth GPS

Fixes go through a small Kalman filter (`frontend/src/gpsFilter.js`) that trusts each fix by its accuracy and drops wild jumps, the dot glides between fixes, and while navigating it snaps to the walking route when within 20 m. Phones also use the compass so the arrow points where you're facing. Laptops have no GPS chip, so they still update only as often (and as accurately, ~20–100 m) as Wi-Fi positioning allows; the smoothing just keeps that from jumping around.

### GPS on your phone

Campus Wi-Fi usually blocks phones from reaching a laptop directly, so use a free Cloudflare quick tunnel, which gives the running dev server a temporary `https://….trycloudflare.com` address:

```bash
# once: winget install Cloudflare.cloudflared
# with the backend and `npm run dev` already running:
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://…trycloudflare.com` link on your phone, allow location, and tap ◎. It works on Wi-Fi or cellular data. The address changes every time you start the tunnel, and anyone with the link can open the app while it runs, so stop it (Ctrl+C) when you're done. `vite.config.js` already allows `*.trycloudflare.com` hosts.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/buildings?q=` | Campus buildings (optional search) |
| `GET /api/buildings/{id}` | Single building |
| `GET /api/buildings/{id}/photo?w=640` | Building photo URL + photographer credit (Google Places) |
| `GET /api/route?from_lat=&from_lng=&to_lat=&to_lng=` | Walking route (distance, time, encoded polyline) via Google Routes |
| `GET /api/faqs` | Campus FAQ entries for the help bubble |
| `GET /api/transit` | MavMover shuttle routes and stops |
| `GET /api/events?days=1` | events.uta.edu + MavEngage events (1–14 days), including event types, all-day flag, room, address and a short description |
| `GET /api/traffic?window_hours=3` | Clustered event heat points |

## Side menu: Directory and Events

The ☰ button in the top-left opens the side menu (× or Esc closes it). On phones it slides over the map.

- **Directory:** every building in `data/buildings.json`, with filter chips by building type (Academic, Student life, Athletics & rec, Administration) and a text filter. Clicking a building selects it on the map.
- **Events:** upcoming events from events.uta.edu, grouped by day, with filter chips by event type (Arts & Culture, Workshops, Athletics…) and a search box. Each event has:
  - **+ Google Calendar:** opens a prefilled Google Calendar event.
  - **+ Apple Calendar:** downloads an `.ics` file that Apple Calendar (and Outlook) open and offer to add.
  - **Show on map:** shown when the event is within 150 m of a known building.

## Directory places

Besides academic buildings, the directory lists **parking** (garages and lots), **dining** (UC food court, cafes and spots right next to campus) and **housing** (residence halls and student apartments). Those coordinates come from OpenStreetMap; each entry's `source` field in `data/buildings.json` names the OSM object it came from.

### Parking lots

All 44 lots on UTA's 2026-27 parking maps are in the directory (Faculty/Staff F1–F17, Lots 24–53, AO, MR, UV, CN/CS = KC North/South, GR, WC, ADAS) plus the five garages. Positions: each lot's label on UTA's map, calibrated against 44 buildings with known coordinates (median error ~13 m), then snapped into the OpenStreetMap parking area it falls in (35 lots); the rest use the calibrated label position. Who may park where comes from UTA's 2026-2027 "Where May I Park with My Permit?" guide; lots it doesn't mention say to check the posted sign or the UTA Parking Finder (go.uta.edu/park). Search by number ("49", "lot f8", "50N") or by need ("park and ride", "faculty parking", "dorm parking").

## Transit (MavMover shuttle)

The **Transit** tab and map layer show UTA's MavMover routes from `data/transit.json` (served at `GET /api/transit`):

- Routes, stop order and hours come from the [MavMover page](https://www.uta.edu/campus-ops/pats/transportation/mav-mover-shuttles). Schedules change by semester, so update this file when UTA does.
- Stop positions use mapped curbside stops from OpenStreetMap where they exist (`"exact": true`), otherwise the building at that stop (`"exact": false`, shown with ≈).
- Dashed lines connect stops in order. They don't trace the streets the bus drives.
- There is no live bus tracking. UTA's old DoubleMap feed no longer exists.

## Favorites and event suggestions

- Tap ☆ on any place or event to save it. Saved places get a gold ring on the map, and both lists have a **★ Saved** filter.
- MavMap learns which event types and locations a student likes from what they save, add to a calendar, open, or filter by. On the next visit it shows a popup with up to 3 *new* events that match.
- All of this is stored only in the browser (`localStorage` keys `mavmap.favorites.v1` and `mavmap.interests.v1`). Students can turn suggestions off or clear what was learned in Preferences.

## Preferences

The **Preferences** button in the top-right holds settings saved in the browser (`localStorage`):

- Theme (dark, light, match device, or **The Odyssey**) and text size (normal, large, extra large)
  - *The Odyssey* (`[data-theme="odyssey"]` in `index.css`): wine-dark and bronze colors with Cinzel headings, a sea-chart map style (Street view), a bronze spear cursor that swings with a golden swoosh and sparks on every click (`OdysseyFx.jsx`), and a stormy top bar with animated rain and lightning (`StormLayer.jsx`). With *reduce motion* turned on in the OS, the rain and swing animations are off and clicks show a simple ring.
- Map view: Street, Satellite, or OpenStreetMap tiles (with OSM attribution, per the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/))
- Show MavMover shuttle stops and routes
- Suggest new events at startup, plus buttons to clear learned interests and saved items
- Show the event traffic heatmap
- Open the side menu on start (computer only), and which tab to start on
- How far ahead to show events: today, 3, 7 or 14 days
- Which calendar buttons to show: Google and Apple, Google only, or Apple only

## Campus FAQs bubble

The orange bubble in the bottom-left of the map opens a help window. Students can:

- Tap a common question, or type their own ("where can I park?", "I lost my ID").
- Type a room such as `NH 106`, `ERB-228` or `room 106 in Nedderman Hall`. The bot names the building and floor (the first digit of the room number) and offers **Show on map**.
- Ask where a building is ("where is the library?").

Answers come from `data/faqs.json`. To add or change one, edit that file and restart the backend:

```json
{
  "id": "parking",
  "question": "Where can I park on campus?",
  "answer": "Most campus lots and garages need a UTA parking permit…",
  "keywords": ["park", "parking", "permit", "visitor parking"],
  "link": "https://www.uta.edu/parking",
  "building": null,
  "featured": true
}
```

- `keywords`: words or phrases students might type. A phrase match ("visitor parking") counts more than a single word.
- `building`: an `id` from `data/buildings.json`, which adds a **Show on map** button. Use `null` for none.
- `featured`: shows the question as a quick-tap chip when the window first opens.

Matching runs in the browser (`frontend/src/faqMatch.js`). If the backend is down, room and building lookups still work.

## Project layout

```
MavMap/
  backend/app/       # FastAPI app
  data/buildings.json
  frontend/src/      # React UI
```
