"""Match each place in data/buildings.json to its Google place id (used for card photos).

Searches Google Places for the place's name near its coordinates and only accepts a result
that is close by. Prints every decision so you can review it, then writes place_id into
buildings.json. Entries that already have a place_id are skipped unless --all is given.

    cd backend
    .venv\\Scripts\\python -m scripts.find_place_ids          # fill in missing ids
    .venv\\Scripts\\python -m scripts.find_place_ids --all    # re-check every place
    .venv\\Scripts\\python -m scripts.find_place_ids --dry-run

Needs GOOGLE_MAPS_API_KEY in backend/.env with "Places API (New)" enabled.
"""

from __future__ import annotations

import json
import math
import sys

import httpx

from app.config import settings

MAX_DISTANCE_M = 150
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"


def distance_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    r = 6371000
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


# Words too common on campus to prove two names are the same place.
GENERIC = {
    "hall", "building", "the", "of", "and", "at", "center", "centre", "uta", "ut", "texas",
    "arlington", "university", "campus", "college", "garage", "parking", "lot", "residents",
}
PARKING_WORDS = ("parking", "garage", "lot")


def _words(text: str) -> list[str]:
    return [w for w in "".join(c.lower() if c.isalnum() else " " for c in text).split() if w]


def names_match(ours: str, google: str) -> bool:
    """Google's name must share a distinctive word with ours (or contain our whole name)."""
    ours = ours.split(" (")[0]
    g = " ".join(_words(google))
    if " ".join(_words(ours)) in g:
        return True
    # A parking lot must not borrow the photo of the hall it is named after.
    if any(w in _words(ours) for w in PARKING_WORDS) and not any(w in g.split() for w in PARKING_WORDS):
        return False
    distinctive = [w for w in _words(ours) if w not in GENERIC and len(w) > 2]
    return any(w in g.split() for w in distinctive)


def search(client: httpx.Client, b: dict) -> dict | None:
    name = b["name"].split(" (")[0]  # "Subway (University Center)" -> "Subway"
    body = {
        "textQuery": f"{name}, University of Texas at Arlington",
        "locationBias": {"circle": {"center": {"latitude": b["lat"], "longitude": b["lng"]}, "radius": 200.0}},
        "maxResultCount": 5,
    }
    r = client.post(
        SEARCH_URL,
        json=body,
        headers={
            "X-Goog-Api-Key": settings.google_maps_api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos.name",
        },
    )
    r.raise_for_status()
    best = None
    for p in r.json().get("places") or []:
        loc = p.get("location") or {}
        d = distance_m(b["lat"], b["lng"], loc.get("latitude", 0), loc.get("longitude", 0))
        if not names_match(b["name"], (p.get("displayName") or {}).get("text", "")):
            continue
        if d <= MAX_DISTANCE_M and p.get("photos") and (best is None or d < best[0]):
            best = (d, p)
    return None if best is None else {"distance": best[0], **best[1]}


def main() -> None:
    if not settings.google_maps_api_key:
        sys.exit("Set GOOGLE_MAPS_API_KEY in backend/.env first.")
    redo = "--all" in sys.argv
    dry = "--dry-run" in sys.argv

    path = settings.buildings_path
    text = path.read_text(encoding="utf-8")
    buildings = json.loads(text)

    changed = 0
    with httpx.Client(timeout=20.0) as client:
        for b in buildings:
            if b.get("place_id") and not redo:
                continue
            match = search(client, b)
            if match is None:
                print(f"  --  {b['name']}: no nearby Google place with photos")
                continue
            print(f"  ok  {b['name']}  ->  {match['displayName']['text']}  ({match['distance']:.0f} m)")
            if b.get("place_id") != match["id"]:
                b["place_id"] = match["id"]
                changed += 1

    if dry or not changed:
        print(f"{changed} place ids would change" if dry else "No changes.")
        return

    # Keep the file's one-key-per-line layout.
    order = ["id", "name", "short", "abbr", "lat", "lng", "category", "address", "note", "description", "offers", "keywords", "place_id", "image", "source"]
    lines = ["["]
    for i, b in enumerate(buildings):
        keys = [k for k in order if k in b] + [k for k in b if k not in order]
        lines.append("  {")
        for j, k in enumerate(keys):
            lines.append(f'    "{k}": {json.dumps(b[k], ensure_ascii=False)}{"," if j < len(keys) - 1 else ""}')
        lines.append("  }" + ("," if i < len(buildings) - 1 else ""))
    lines.append("]")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {changed} place ids to {path}")


if __name__ == "__main__":
    main()
