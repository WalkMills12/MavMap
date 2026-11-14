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
| `GET /api/events?days=1` | Normalized Localist events |
| `GET /api/traffic?window_hours=3` | Clustered event heat points |

## Project layout

```
MavMap/
  backend/app/       # FastAPI app
  data/buildings.json
  frontend/src/      # React UI
```
