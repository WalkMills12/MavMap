from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import settings
from .models import CampusEvent, TrafficPoint, TrafficResponse

# Cache per "days" value so a 1-day request never answers a 7-day one.
_cache: Dict[int, Dict[str, Any]] = {}
_MAX_PAGES = 4  # Localist caps pages at 100 events
_DESCRIPTION_LIMIT = 600


def _parse_localist_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_event(raw: Dict[str, Any]) -> Optional[CampusEvent]:
    event = raw.get("event") or raw
    geo = event.get("geo") or {}
    lat_raw = geo.get("latitude")
    lng_raw = geo.get("longitude")
    lat = float(lat_raw) if lat_raw not in (None, "") else None
    lng = float(lng_raw) if lng_raw not in (None, "") else None

    instance = _pick_instance(event.get("event_instances") or [])
    start = instance.get("start")
    end = instance.get("end")

    event_id = event.get("id")
    title = event.get("title")
    if event_id is None or not title:
        return None

    filters = event.get("filters") or {}
    types = [t.get("name") for t in filters.get("event_types") or [] if t.get("name")]

    description = (event.get("description_text") or "").strip()
    if len(description) > _DESCRIPTION_LIMIT:
        description = description[:_DESCRIPTION_LIMIT].rsplit(" ", 1)[0] + "…"

    return CampusEvent(
        id=int(event_id),
        title=title,
        start=start,
        end=end,
        lat=lat,
        lng=lng,
        location=event.get("location_name") or event.get("location"),
        url=event.get("localist_url"),
        all_day=bool(instance.get("all_day")),
        room=event.get("room_number") or None,
        address=event.get("address") or None,
        description=description or None,
        types=types,
        photo_url=event.get("photo_url") or None,
    )


def _pick_instance(instances: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Recurring events list several instances; use the first one that hasn't ended yet."""
    now = datetime.now(timezone.utc)
    parsed = [(item or {}).get("event_instance") or {} for item in instances]
    for inst in parsed:
        end = _parse_localist_datetime(inst.get("end")) or _parse_localist_datetime(inst.get("start"))
        if end is None:
            continue
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if inst.get("all_day"):
            end = end + timedelta(days=1)
        if end >= now:
            return inst
    return parsed[0] if parsed else {}


async def fetch_localist_events(days: int = 2, per_page: int = 100) -> List[CampusEvent]:
    now = time.time()
    cached = _cache.get(days)
    if cached and now - cached["fetched_at"] < settings.events_cache_ttl_seconds:
        return cached["events"]

    url = f"{settings.localist_base_url}/events"
    events: List[CampusEvent] = []
    seen = set()
    async with httpx.AsyncClient(timeout=20.0) as client:
        for page in range(1, _MAX_PAGES + 1):
            response = await client.get(url, params={"days": days, "pp": per_page, "page": page})
            response.raise_for_status()
            payload = response.json()
            for item in payload.get("events") or []:
                normalized = _normalize_event(item)
                if normalized and normalized.id not in seen:
                    seen.add(normalized.id)
                    events.append(normalized)
            info = payload.get("page") or {}
            if not info.get("total") or page >= int(info["total"]):
                break

    events.sort(key=lambda e: e.start or "")
    _cache[days] = {"events": events, "fetched_at": now}
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