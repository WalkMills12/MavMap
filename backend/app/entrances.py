"""Where to send walkers for a building: its doors, or the side of the building facing them.

Routing to a building's center point makes Google route to whatever path happens to be nearest
the middle of the footprint (often the back of the building, or a street around it). Instead we
try the nearest mapped door and the nearest point on the building's outline, and keep whichever
gives the shorter walk. Data: data/entrances.json, built from OpenStreetMap.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import Dict, List, Tuple

from .config import settings

LatLng = Tuple[float, float]
_SAME_SPOT_M = 15  # two candidates closer than this are the same target


@lru_cache(maxsize=1)
def _load() -> Dict[str, dict]:
    path = settings.entrances_path
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def distance_m(a: LatLng, b: LatLng) -> float:
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _nearest_on_outline(p: LatLng, ring: List[List[float]]) -> LatLng:
    k = math.cos(math.radians(p[0])) * 111_320
    best = None
    for a, b in zip(ring, ring[1:] + ring[:1]):
        ax, ay = (a[1] - p[1]) * k, (a[0] - p[0]) * 111_320
        bx, by = (b[1] - p[1]) * k, (b[0] - p[0]) * 111_320
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / l2)) if l2 else 0.0
        d = math.hypot(ax + t * dx, ay + t * dy)
        if best is None or d < best[0]:
            best = (d, (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
    return best[1]


def walk_targets(building_id: str, center: LatLng, origin: LatLng) -> List[Tuple[LatLng, str]]:
    """Up to two places to route to for this building, best guesses first."""
    entry = _load().get(building_id, {})
    targets: List[Tuple[LatLng, str]] = []
    doors = [tuple(d) for d in entry.get("doors") or []]
    if doors:
        targets.append((min(doors, key=lambda d: distance_m(origin, d)), "door"))
    if entry.get("outline"):
        side = _nearest_on_outline(origin, entry["outline"])
        if not targets or distance_m(side, targets[0][0]) > _SAME_SPOT_M:
            targets.append((side, "side"))
    if not targets:
        targets.append((center, "center"))
    return targets
