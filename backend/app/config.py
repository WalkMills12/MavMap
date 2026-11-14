from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    buildings_path: Path = DATA_DIR / "buildings.json"
    faqs_path: Path = DATA_DIR / "faqs.json"
    transit_path: Path = DATA_DIR / "transit.json"
    localist_base_url: str = "https://events.uta.edu/api/2"
    events_cache_ttl_seconds: int = 300
    traffic_window_hours: int = 3
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


settings = Settings()