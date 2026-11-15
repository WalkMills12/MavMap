from __future__ import annotations

from typing import List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .buildings import get_building, get_buildings
from .config import settings
from .events import build_traffic, fetch_campus_events
from .faqs import get_faqs
from .transit import get_transit
from .entrances import distance_m, walk_targets
from .google import place_info, place_photo, walking_route
from .models import (
    Building,
    BuildingPhoto,
    CampusEvent,
    Faq,
    HealthResponse,
    PlaceInfo,
    TrafficResponse,
    WalkingRoute,
)

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


@app.get("/api/buildings/{building_id}/photo", response_model=BuildingPhoto)
async def building_photo(
    building_id: str,
    w: int = Query(default=640, ge=100, le=1600, description="Photo width in pixels"),
) -> BuildingPhoto:
    building = get_building(building_id)
    if building.image:
        return BuildingPhoto(url=building.image)
    if not building.place_id:
        raise HTTPException(status_code=404, detail="No photo for this building")
    try:
        photo = await place_photo(building.place_id, w)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Places error: {exc}") from exc
    if photo is None:
        raise HTTPException(status_code=404, detail="No photo for this building")
    return photo


@app.get("/api/buildings/{building_id}/info", response_model=PlaceInfo)
async def building_info(building_id: str) -> PlaceInfo:
    """Live hours / open now / website / phone from the building's Google listing."""
    building = get_building(building_id)
    if not building.place_id:
        raise HTTPException(status_code=404, detail="No Google listing for this building")
    try:
        info = await place_info(building.place_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Places error: {exc}") from exc
    if info is None:
        raise HTTPException(status_code=404, detail="No Google listing for this building")
    return info


@app.get("/api/route", response_model=WalkingRoute)
async def route(
    from_lat: float = Query(ge=-90, le=90),
    from_lng: float = Query(ge=-180, le=180),
    to_lat: Optional[float] = Query(default=None, ge=-90, le=90),
    to_lng: Optional[float] = Query(default=None, ge=-180, le=180),
    building: Optional[str] = Query(default=None, description="Route to this building's nearest door / side"),
) -> WalkingRoute:
    """Walking route (used by live GPS navigation).

    With `building`, the walk ends at the building's nearest door or the side facing you
    (whichever is the shorter walk) rather than its center point.
    """
    origin = (from_lat, from_lng)
    try:
        if building:
            b = get_building(building)
            best: Optional[WalkingRoute] = None
            best_total = float("inf")
            targets = walk_targets(b.id, (b.lat, b.lng), origin)
            has_door = any(kind == "door" for _, kind in targets)
            for target, kind in targets:
                r = await walking_route(from_lat, from_lng, target[0], target[1])
                # The route stops on the nearest path; count the last few steps to the door too.
                total = r.distance_m + distance_m(_route_end(r), target)
                # A wall isn't always a way in: prefer a real door unless the side is much closer.
                if kind == "side" and has_door:
                    total += SIDE_PENALTY_M
                if total < best_total:
                    best_total = total
                    best = r.model_copy(update={"target_lat": target[0], "target_lng": target[1], "target_kind": kind})
            assert best is not None
            return best
        if to_lat is None or to_lng is None:
            raise HTTPException(status_code=422, detail="Give to_lat/to_lng or building")
        return await walking_route(from_lat, from_lng, to_lat, to_lng)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Routes error: {exc}") from exc


SIDE_PENALTY_M = 40


def _route_end(r: WalkingRoute) -> tuple:
    """Last point of an encoded polyline."""
    lat = lng = 0
    i = 0
    enc = r.polyline
    while i < len(enc):
        for axis in (0, 1):
            res = shift = 0
            while True:
                c = ord(enc[i]) - 63
                i += 1
                res |= (c & 0x1F) << shift
                shift += 5
                if c < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if axis == 0:
                lat += d
            else:
                lng += d
    return (lat / 1e5, lng / 1e5)


@app.get("/api/faqs", response_model=List[Faq])
def list_faqs() -> List[Faq]:
    return get_faqs()


@app.get("/api/transit")
def transit() -> dict:
    return get_transit()


@app.get("/api/events", response_model=List[CampusEvent])
async def list_events(
    days: int = Query(default=1, ge=1, le=14),
) -> List[CampusEvent]:
    try:
        return await fetch_campus_events(days=days)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch campus events: {exc}") from exc


@app.get("/api/traffic", response_model=TrafficResponse)
async def traffic(
    window_hours: Optional[int] = Query(default=None, ge=1, le=24),
) -> TrafficResponse:
    try:
        events = await fetch_campus_events(days=2)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch campus events: {exc}") from exc
    return build_traffic(events, window_hours=window_hours)