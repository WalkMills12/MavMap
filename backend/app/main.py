from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .buildings import get_building, get_buildings
from .config import settings
from .events import build_traffic, fetch_localist_events
from .faqs import get_faqs
from .footprints import get_footprints
from .models import Building, CampusEvent, Faq, HealthResponse, TrafficResponse
from .transit import get_transit

app = FastAPI(title="MavMap API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/api/buildings", response_model=List[Building])
def list_buildings(
    q: Optional[str] = Query(default=None, description="Search name or abbreviation"),
) -> List[Building]:
    return get_buildings(q)


@app.get("/api/buildings/{building_id}", response_model=Building)
def building_detail(building_id: str) -> Building:
    return get_building(building_id)


@app.get("/api/footprints")
def building_footprints() -> Dict[str, Any]:
    """GeoJSON FeatureCollection of campus building outlines (colored by category on the client)."""
    return get_footprints()


@app.get("/api/faqs", response_model=List[Faq])
def list_faqs() -> List[Faq]:
    return get_faqs()


@app.get("/api/transit")
def transit() -> dict:
    return get_transit()


@app.get("/api/events", response_model=List[CampusEvent])
async def list_events(
    days: int = Query(default=7, ge=1, le=14),
    campus_only: bool = Query(
        default=True,
        description="Only events with a location inside the UTA campus bounds",
    ),
) -> List[CampusEvent]:
    try:
        return await fetch_localist_events(days=days, campus_only=campus_only)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch UTA events: {exc}") from exc


@app.get("/api/traffic", response_model=TrafficResponse)
async def traffic(
    window_hours: Optional[int] = Query(default=None, ge=1, le=24),
) -> TrafficResponse:
    try:
        events = await fetch_localist_events(days=2, campus_only=True)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch UTA events: {exc}") from exc
    return build_traffic(events, window_hours=window_hours)