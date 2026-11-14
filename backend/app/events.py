from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import settings
from .models import CampusEvent, TrafficPoint, TrafficResponse

# Same footprint as the frontend map restriction — main campus + nearby UTA sites.
UTA_BOUNDS = {
    "north": 32.7405,
    "south": 32.7205,
    "east": -97.0985,
    "west": -97.1265,
}

_cache: Dict[str, Any] = {}


def _parse_localist_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def is_on_uta_campus(lat: Optional[float], lng: Optional[float]) -> bool:
    if lat is None or lng is None:
        return False
    return (
        UTA_BOUNDS["south"] <= lat <= UTA_BOUNDS["north"]
        and UTA_BOUNDS["west"] <= lng <= UTA_BOUNDS["east"]
    )


def _normalize_event(raw: Dict[str, Any]) -> Optional[CampusEvent]:
    event = raw.get("event") or raw
    geo = event.get("geo") or {}
    lat_raw = geo.get("latitude")
    lng_raw = geo.get("longitude")
    lat = float(lat_raw) if lat_raw not in (None, "") else None
    lng = float(lng_raw) if lng_raw not in (None, "") else None

    instances = event.get("event_instances") or []
    start = end = None
    if instances:
        instance = (instances[0] or {}).get("event_instance") or {}
        start = instance.get("start")
        end = instance.get("end")

    event_id = event.get("id")
    title = event.get("title")
    if event_id is None or not title:
        return None

    return CampusEvent(
        id=int(event_id),
        title=title,
        start=start,
        end=end,
        lat=lat,
        lng=lng,
        location=event.get("location_name") or event.get("location"),
        url=event.get("localist_url"),
        ics_url=event.get("localist_ics_url"),
        experience=event.get("experience"),
    )


async def fetch_localist_events(
    days: int = 2,
    per_page: int = 100,
    campus_only: bool = True,
) -> List[CampusEvent]:
    cache_key = f"events:{days}:{campus_only}"
    cached = _cache.get(cache_key)
    now = time.time()
    if cached and now - cached["fetched_at"] < settings.events_cache_ttl_seconds:
        return cached["events"]

    url = f"{settings.localist_base_url}/events"
    params = {"days": days, "pp": per_page}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()

    events: List[CampusEvent] = []
    for item in payload.get("events") or []:
        normalized = _normalize_event(item)
        if not normalized:
            continue
        # Drop virtual / off-campus / no-location events when campus_only.
        if campus_only and not is_on_uta_campus(normalized.lat, normalized.lng):
            continue
        events.append(normalized)

    events.sort(key=lambda e: e.start or "")
    _cache[cache_key] = {"events": events, "fetched_at": now}
    return events


def _event_in_window(event: CampusEvent, now: datetime, window_end: datetime) -> bool:
    start = _parse_localist_datetime(event.start)
    end = _parse_localist_datetime(event.end)

    if start is None and end is None:
        return False

    if start and end is None:
        end = start + timedelta(hours=2)
    if end and start is None:
        start = end - timedelta(hours=2)

    assert start is not None and end is not None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    return start <= window_end and end >= now


def build_traffic(
    events: List[CampusEvent], window_hours: Optional[int] = None
) -> TrafficResponse:
    hours = window_hours or settings.traffic_window_hours
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(hours=hours)

    clusters: Dict[Tuple[float, float, str], TrafficPoint] = {}

    for event in events:
        if event.lat is None or event.lng is None:
            continue
        if not is_on_uta_campus(event.lat, event.lng):
            continue
        if not _event_in_window(event, now, window_end):
            continue

        lat = round(event.lat, 4)
        lng = round(event.lng, 4)
        label = event.location or "Campus event"
        key = (lat, lng, label)

        if key not in clusters:
            clusters[key] = TrafficPoint(lat=lat, lng=lng, weight=0, label=label, events=[])
        clusters[key].events.append(event)
        clusters[key].weight = float(len(clusters[key].events))

    points = sorted(clusters.values(), key=lambda p: p.weight, reverse=True)
    return TrafficResponse(window_hours=hours, points=points)
