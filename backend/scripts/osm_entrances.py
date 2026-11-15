"""Build data/entrances.json: mapped doors + simplified outline for each OSM-sourced building.

usage (from the repo root, after osm_doors.py):
    backend/.venv/Scripts/python backend/scripts/osm_entrances.py . doors.json
"""
import json
import math
import re
import sys
import time
from pathlib import Path

import httpx

repo = Path(sys.argv[1])
doors = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
buildings = json.loads((repo / "data/buildings.json").read_text(encoding="utf-8"))

refs = {}
for b in buildings:
    m = re.match(r"OpenStreetMap (way|relation)/(\d+)", b.get("source") or "")
    if m:
        refs[b["id"]] = (m.group(1), int(m.group(2)))

ways = ",".join(str(i) for t, i in refs.values() if t == "way")
rels = ",".join(str(i) for t, i in refs.values() if t == "relation")
query = f"[out:json][timeout:120];(way(id:{ways});" + (f"relation(id:{rels});" if rels else "") + ");out geom;"
hdr = {"User-Agent": "campus-map-dev/0.1", "Accept": "application/json"}
for attempt in range(4):
    resp = httpx.post("https://overpass-api.de/api/interpreter", data={"data": query}, headers=hdr, timeout=150)
    if resp.status_code == 200 and resp.text.lstrip().startswith("{"):
        break
    print("overpass busy, retrying", resp.status_code)
    time.sleep(10)
data = resp.json()
print("elements:", len(data["elements"]), "remark:", data.get("remark"))
els = {(e["type"], e["id"]): e for e in data["elements"]}


def ring(e):
    if e["type"] == "way":
        return [(p["lat"], p["lon"]) for p in e.get("geometry", [])]
    pts = []  # relation: use the outer member(s)
    for m in e.get("members", []):
        if m.get("role") == "outer" and m.get("geometry"):
            pts += [(p["lat"], p["lon"]) for p in m["geometry"]]
    return pts


def simplify(pts, tol_m=2.0):
    """Douglas-Peucker in meters; outlines only need to be good to a couple of meters."""
    if len(pts) < 4:
        return pts
    lat0 = pts[0][0]
    k = math.cos(math.radians(lat0))
    xy = [((p[1]) * 111320 * k, p[0] * 111320) for p in pts]

    def rdp(i, j):
        ax, ay = xy[i]
        bx, by = xy[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, idx = 0, None
        for m in range(i + 1, j):
            px, py = xy[m]
            # Closed rings start and end on the same point: measure from that point instead.
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L if L > 1e-6 else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, m
        if best > tol_m and idx is not None:
            return rdp(i, idx)[:-1] + rdp(idx, j)
        return [i, j]

    keep = rdp(0, len(pts) - 1)
    return [pts[i] for i in keep]


out = {}
for bid, (t, i) in refs.items():
    e = els.get((t, i))
    outline = simplify(ring(e)) if e else []
    entry = {}
    if bid in doors:
        entry["doors"] = [[d[0], d[1]] for d in doors[bid]]
    if len(outline) >= 3:
        entry["outline"] = [[round(a, 6), round(o, 6)] for a, o in outline]
    if entry:
        out[bid] = entry

dest = repo / "data/entrances.json"
lines = ["{", '  "_source": "OpenStreetMap contributors (ODbL). doors = mapped entrance nodes; outline = simplified building footprint.",']
items = sorted(out.items())
for n, (bid, entry) in enumerate(items):
    lines.append(f'  "{bid}": {json.dumps(entry, separators=(",", ":"))}' + ("," if n < len(items) - 1 else ""))
lines.append("}")
dest.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
print(f"wrote {dest} for {len(out)} places; {sum('doors' in v for v in out.values())} with doors, {sum('outline' in v for v in out.values())} with outlines; {dest.stat().st_size // 1024} KB")
