"""MavEngage events (UTA's Campus Labs Engage site, mavengage.uta.edu).

Uses the same public, no-login search that powers https://mavengage.uta.edu/engage/events, so it
only returns events MavEngage shows to everyone.
"""

from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from .config import settings
from .models import CampusEvent

_PAGE = 100
_MAX_PAGES = 6
_DESCRIPTION_LIMIT = 600
try:
    from zoneinfo import ZoneInfo

    _CENTRAL = ZoneInfo("America/Chicago")
except Exception:  # Windows without the tzdata package
    _CENTRAL = timezone(timedelta(hours=-6))

# Engage tags that describe *when*, not *what*; they'd only clutter the type chips.
_SKIP_CATEGORIES = {"evening/night", "daytime", "weekend"}


def _plain_text(markup: Optional[str]) -> Optional[str]:
    if not markup:
        return None
    text = re.sub(r"<(br|/p|/div|/li)\s*/?>", " ", markup, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if len(text) > _DESCRIPTION_LIMIT:
        text = text[:_DESCRIPTION_LIMIT].rsplit(" ", 1)[0] + "…"
    return text or None


def _float(value: Any) -> Optional[float]:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _image(item: Dict[str, Any]) -> Optional[str]:
    path = item.get("imagePath") or item.get("organizationProfilePicture")
    if not path:
        return None
    return f"{settings.engage_image_url}/{path}?preset=med-w"


def _normalize(item: Dict[str, Any]) -> Optional[CampusEvent]:
    if not item.get("id") or not item.get("name"):
        return None
    if (item.get("visibility") or "Public") != "Public":
        return None
    types = [c for c in item.get("categoryNames") or [] if c and c.lower() not in _SKIP_CATEGORIES]
    if not types and item.get("theme"):
        types = [re.sub(r"(?<=[a-z])(?=[A-Z])", " ", item["theme"])]  # "ThoughtfulLearning" -> "Thoughtful Learning"
    start, end, all_day = item.get("startsOn"), item.get("endsOn"), False
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
        # Postings that run for days (ticket sales, donation drives) aren't one long meeting:
        # show them as all-day events "through" their last day, in campus time.
        if e - s > timedelta(hours=30):
            all_day = True
            start = s.astimezone(_CENTRAL).isoformat()
            end = e.astimezone(_CENTRAL).isoformat()
    except (AttributeError, ValueError):
        pass
    return CampusEvent(
        id=f"me-{item['id']}",
        title=item["name"].strip(),
        start=start,
        end=end,
        all_day=all_day,
        lat=_float(item.get("latitude")),
        lng=_float(item.get("longitude")),
        location=(item.get("location") or "").strip() or None,
        url=f"{settings.engage_base_url}/event/{item['id']}",
        description=_plain_text(item.get("description")),
        types=types,
        photo_url=_image(item),
        source="MavEngage",
        host=item.get("organizationName") or None,
    )


async def fetch_engage_events(days: int) -> List[CampusEvent]:
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=days)
    events: List[CampusEvent] = []
    async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "MavMap/0.1"}) as client:
        for page in range(_MAX_PAGES):
            r = await client.get(
                f"{settings.engage_base_url}/api/discovery/event/search",
                params={
                    "endsAfter": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "orderByField": "startsOn",
                    "orderByDirection": "ascending",
                    "status": "Approved",
                    "take": _PAGE,
                    "skip": page * _PAGE,
                    "query": "",
                },
            )
            r.raise_for_status()
            batch = r.json().get("value") or []
            past_window = False
            for item in batch:
                start = item.get("startsOn")
                try:
                    if start and datetime.fromisoformat(start.replace("Z", "+00:00")) > horizon:
                        past_window = True
                        continue
                except ValueError:
                    pass
                ev = _normalize(item)
                if ev:
                    events.append(ev)
            if len(batch) < _PAGE or past_window:
                break
    return events
