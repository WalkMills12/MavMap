#!/usr/bin/env python3
"""Copy backend campus data into frontend/src/data with baked-in colors.

Run after editing data/buildings.json or data/building_footprints.geojson:
  python3 scripts/sync_frontend_campus_data.py
"""
from __future__ import annotations

import json
from pathlib import Path

COLORS = {
    "academic": "#F5C518",
    "student_life": "#4FC3F7",
    "athletics": "#F58220",
    "admin": "#B39DDB",
    "dining": "#FFB74D",
    "housing": "#43A047",
    "parking": "#9AA6B8",
    "campus": "#8FB3A8",
    "default": "#F58220",
}


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    buildings = json.loads((root / "data/buildings.json").read_text())
    fc = json.loads((root / "data/building_footprints.geojson").read_text())

    for feature in fc.get("features", []):
        props = feature.setdefault("properties", {})
        cat = props.get("category") or "default"
        color = COLORS.get(cat, COLORS["default"])
        props["fillColor"] = color
        props["strokeColor"] = color

    out = root / "frontend/src/data"
    out.mkdir(parents=True, exist_ok=True)
    (out / "buildings.json").write_text(json.dumps(buildings, indent=2) + "\n")
    (out / "building_footprints.json").write_text(json.dumps(fc) + "\n")
    print(
        f"Synced {len(buildings)} buildings and "
        f"{len(fc.get('features', []))} footprints → {out}"
    )


if __name__ == "__main__":
    main()
