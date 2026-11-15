from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
DATA_DIR = ROOT_DIR / "data"


class Settings(BaseSettings):
    # backend/.env, wherever uvicorn is started from
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Server-side Google key for building photos (Places API) and walking routes (Routes API).
    # Optional: without it, cards show colored badges and GPS draws a straight line.
    google_maps_api_key: str = ""
    google_cache_ttl_seconds: int = 6 * 3600

    buildings_path: Path = DATA_DIR / "buildings.json"
    faqs_path: Path = DATA_DIR / "faqs.json"
    transit_path: Path = DATA_DIR / "transit.json"
    entrances_path: Path = DATA_DIR / "entrances.json"  # building doors + outlines (OpenStreetMap)
    localist_base_url: str = "https://events.uta.edu/api/2"
    # MavEngage (Campus Labs Engage): the public "discover events" search used by mavengage.uta.edu
    engage_base_url: str = "https://mavengage.uta.edu/engage"
    engage_image_url: str = "https://se-images.campuslabs.com/clink/images"
    events_cache_ttl_seconds: int = 90  # the app polls for live updates, so keep this short
    traffic_window_hours: int = 3
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()