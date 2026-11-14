from __future__ import annotations

import json
from functools import lru_cache
from typing import List, Optional

from fastapi import HTTPException

from .config import settings
from .models import Building


@lru_cache(maxsize=1)
def load_buildings() -> List[Building]:
    path = settings.buildings_path
    if not path.exists():
        raise FileNotFoundError(f"Buildings file not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [Building.model_validate(item) for item in raw]


def get_buildings(q: Optional[str] = None) -> List[Building]:
    try:
        buildings = load_buildings()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not q:
        return buildings

    needle = q.strip().lower()
    if not needle:
        return buildings

    matches: List[Building] = []
    for building in buildings:
        haystacks = [building.name.lower(), building.id.lower(), *building.abbr]
        if any(needle in value.lower() for value in haystacks):
            matches.append(building)
    return matches


def get_building(building_id: str) -> Building:
    for building in get_buildings():
        if building.id == building_id:
            return building
    raise HTTPException(status_code=404, detail=f"Building not found: {building_id}")