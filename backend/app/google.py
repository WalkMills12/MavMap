"""Server-side Google Maps Platform calls: building photos (Places API New) and walking routes
(Routes API). Results are cached in memory so repeat views don't cost another request."""

from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple

import httpx
from fastapi import HTTPException

from .config import settings
from .models import BuildingPhoto, PlaceInfo, WalkingRoute

PLACES_URL = "https://places.googleapis.com/v1"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

_photo_cache: Dict[Tuple[str, int], Tuple[float, Optional[BuildingPhoto]]] = {}
_route_cache: Dict[Tuple[float, float, float, float], Tuple[float, WalkingRoute]] = {}


def _key() -> str:
    if not settings.google_maps_api_key:
        raise HTTPException(status_code=503, detail="GOOGLE_MAPS_API_KEY is not set in backend/.env")
    return settings.google_maps_api_key


def _fresh(stamp: float) -> bool:
    return time.time() - stamp < settings.google_cache_ttl_seconds


async def place_photo(place_id: str, width: int) -> Optional[BuildingPhoto]:
    """First Google photo for a place, with the attribution Google requires us to show."""
    cache_key = (place_id, width)
    hit = _photo_cache.get(cache_key)
    if hit and _fresh(hit[0]):
        return hit[1]

    key = _key()
    async with httpx.AsyncClient(timeout=15.0) as client:
        details = await client.get(
            f"{PLACES_URL}/places/{place_id}",
            headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos"},
        )
        if details.status_code == 404:
            _photo_cache[cache_key] = (time.time(), None)
            return None
        details.raise_for_status()
        photos = details.json().get("photos") or []
        if not photos:
            _photo_cache[cache_key] = (time.time(), None)
            return None

        photo = photos[0]
        media = await client.get(
            f"{PLACES_URL}/{photo['name']}/media",
            params={"maxWidthPx": width, "skipHttpRedirect": "true", "key": key},
        )
        media.raise_for_status()
        uri = media.json().get("photoUri")

    author: Dict[str, Any] = (photo.get("authorAttributions") or [{}])[0]
    result = (
        BuildingPhoto(url=uri, author=author.get("displayName"), author_url=author.get("uri"))
        if uri
        else None
    )
    _photo_cache[cache_key] = (time.time(), result)
    return result


_info_cache: Dict[str, Tuple[float, Optional[PlaceInfo]]] = {}
_INFO_TTL = 30 * 60  # opening hours / open-now change during the day


async def place_info(place_id: str) -> Optional[PlaceInfo]:
    """Hours, open-now, website and phone from the building's Google listing."""
    hit = _info_cache.get(place_id)
    if hit and time.time() - hit[0] < _INFO_TTL:
        return hit[1]

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            f"{PLACES_URL}/places/{place_id}",
            headers={
                "X-Goog-Api-Key": _key(),
                "X-Goog-FieldMask": "currentOpeningHours,regularOpeningHours,websiteUri,nationalPhoneNumber,editorialSummary",
            },
        )
        if r.status_code == 404:
            _info_cache[place_id] = (time.time(), None)
            return None
        r.raise_for_status()
        d = r.json()

    hours = d.get("currentOpeningHours") or d.get("regularOpeningHours") or {}
    info = PlaceInfo(
        open_now=hours.get("openNow"),
        hours=hours.get("weekdayDescriptions") or [],
        website=d.get("websiteUri"),
        phone=d.get("nationalPhoneNumber"),
        summary=(d.get("editorialSummary") or {}).get("text"),
    )
    _info_cache[place_id] = (time.time(), info)
    return info


async def walking_route(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> WalkingRoute:
    # Round the start to ~10 m so a walker's GPS jitter reuses the cached route.
    cache_key = (round(from_lat, 4), round(from_lng, 4), round(to_lat, 5), round(to_lng, 5))
    hit = _route_cache.get(cache_key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]

    body = {
        "origin": {"location": {"latLng": {"latitude": from_lat, "longitude": from_lng}}},
        "destination": {"location": {"latLng": {"latitude": to_lat, "longitude": to_lng}}},
        "travelMode": "WALK",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            ROUTES_URL,
            json=body,
            headers={
                "X-Goog-Api-Key": _key(),
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
            },
        )
        response.raise_for_status()
        routes = response.json().get("routes") or []

    if not routes:
        raise HTTPException(status_code=404, detail="No walking route found")
    r = routes[0]
    route = WalkingRoute(
        distance_m=int(r.get("distanceMeters") or 0),
        duration_s=int(str(r.get("duration") or "0s").rstrip("s") or 0),
        polyline=(r.get("polyline") or {}).get("encodedPolyline") or "",
    )
    _route_cache[cache_key] = (time.time(), route)
    return route
