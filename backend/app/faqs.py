from __future__ import annotations

import json
from functools import lru_cache
from typing import List

from fastapi import HTTPException

from .config import settings
from .models import Faq


@lru_cache(maxsize=1)
def load_faqs() -> List[Faq]:
    path = settings.faqs_path
    if not path.exists():
        raise FileNotFoundError(f"FAQ file not found: {path}")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [Faq.model_validate(item) for item in raw]


def get_faqs() -> List[Faq]:
    try:
        return load_faqs()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
