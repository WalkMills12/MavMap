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

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/buildings?q=` | Campus buildings (optional search) |
| `GET /api/buildings/{id}` | Single building |
| `GET /api/faqs` | Campus FAQ entries for the help bubble |
| `GET /api/transit` | MavMover shuttle routes and stops |
| `GET /api/events?days=1` | Normalized Localist events (1–14 days), including event types, all-day flag, room, address and a short description |
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

## Walking directions to class

Tap **Walk me there** on a building's panel, or in the FAQ chat after looking up a room (for example "NH 106"). MavMap then:

- asks the browser for your location and keeps tracking it (blue dot, accuracy circle and a heading arrow),
- asks Google's **Routes API** for the best walking route and draws it on the map,
- shows the next turn and the distance to it in a banner at the top, plus time left, distance and arrival time at the bottom, with a step list,
- follows you as you walk (drag the map to look around, then **Re-center**), finds a new route if you get more than about 30 m off it, and says when you've arrived,
- keeps the phone screen on while navigating, where the browser allows it.

Requirements:
- Your Google Maps key needs the **Routes API** enabled (same key as the map).
- Browsers only share location on `https://` sites or `http://localhost`. To navigate on a phone, open MavMap from an HTTPS address (a deployed site, or a tunnel to your computer). `http://<your-ip>:5173` won't get location.
- **Simulate walk** (in the bottom bar) walks the route for you at 3× speed, for testing on a computer.

Location is only used in your browser and sent to Google to compute the route. MavMap doesn't store it.

## Photos

- **Events:** the photo each event has on events.uta.edu, shown at the top of its card (the `big_300` size).
- **Buildings:** 23 buildings have a photo at the top of their detail panel, from Wikimedia Commons. All are by Michael Barera (March 2021) under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The license requires credit, so each photo shows the author and license and links to its Commons page. Photos live in the `photo` field of `data/buildings.json`. Add one with `{ "url", "author", "license", "page" }`, and keep the credit.

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
  - *The Odyssey* (`[data-theme="odyssey"]` in `index.css`): wine-dark and bronze colors with Cinzel headings, a sea-chart map style (Street view), a sword cursor that swings when you click, with no trail left behind (`SwordCursor.jsx`, mouse and pen only; at rest it's the real system cursor with its hotspot on the blade tip, so clicks are pixel-accurate), and a stormy top bar with animated rain and lightning (`StormLayer.jsx`). With *reduce motion* turned on in the OS, the rain and the swing are off.
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
