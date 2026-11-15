from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict

from fastapi import HTTPException

from .config import settings


@lru_cache(maxsize=1)
def load_footprints() -> Dict[str, Any]:
    path = settings.footprints_path
    if not path.exists():
        raise FileNotFoundError(f"Footprints file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def get_footprints() -> Dict[str, Any]:
    try:
        return load_footprints()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
