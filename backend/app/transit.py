from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict

from fastapi import HTTPException

from .config import settings


@lru_cache(maxsize=1)
def load_transit() -> Dict[str, Any]:
    path = settings.transit_path
    if not path.exists():
        raise FileNotFoundError(f"Transit file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    stops = data.get("stops", {})
    for route in data.get("routes", []):
        missing = [s for s in route.get("stops", []) if s not in stops]
        if missing:
            raise ValueError(f"Route {route.get('id')} references unknown stops: {missing}")
    return data


def get_transit() -> Dict[str, Any]:
    try:
        return load_transit()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
