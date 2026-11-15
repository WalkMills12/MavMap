"""Find mapped entrances (doors) for each building in data/buildings.json from OpenStreetMap.

For entries whose `source` is an OSM way/relation, fetch that outline's entrance nodes.
Writes <out.json>: { building_id: [[lat, lng, kind], ...] } and prints coverage.

usage (from the repo root):
    backend/.venv/Scripts/python backend/scripts/osm_doors.py . doors.json
then run osm_entrances.py with that doors.json.
"""
import json
import re
import sys
from pathlib import Path

import httpx

repo = Path(sys.argv[1])
out = Path(sys.argv[2])
buildings = json.loads((repo / "data/buildings.json").read_text(encoding="utf-8"))

refs = {}
for b in buildings:
    m = re.match(r"OpenStreetMap (way|relation)/(\d+)", b.get("source") or "")
    if m:
        refs[b["id"]] = (m.group(1), int(m.group(2)))

ways = ",".join(str(i) for t, i in refs.values() if t == "way")
rels = ",".join(str(i) for t, i in refs.values() if t == "relation")
query = (
    "[out:json][timeout:120];"
    f"way(id:{ways})->.w;"
    + (f"relation(id:{rels})->.r;way(r.r)->.rw;" if rels else "")
    + "(.w;" + (".rw;.r;" if rels else "") + ")->.all;"
    + ".all out body;"
    + "node(w.w)[entrance];out;"
    + ("node(w.rw)[entrance];out;" if rels else "")
)
hdr = {"User-Agent": "campus-map-dev/0.1", "Accept": "application/json"}
import time
for attempt in range(4):
    resp = httpx.post("https://overpass-api.de/api/interpreter", data={"data": query}, headers=hdr, timeout=150)
    if resp.status_code == 200 and resp.text.lstrip().startswith("{"):
        break
    print("overpass busy, retrying", resp.status_code)
    time.sleep(10)
elements = resp.json()["elements"]
ent = [e for e in elements if e["type"] == "node"]
wys = [e for e in elements if e["type"] in ("way", "relation")]

node_info = {e["id"]: (e["lat"], e["lon"], e.get("tags", {}).get("entrance", "yes")) for e in ent}
way_nodes = {e["id"]: e.get("nodes", []) for e in wys if e["type"] == "way"}
rel_ways = {e["id"]: [m["ref"] for m in e.get("members", []) if m["type"] == "way"] for e in wys if e["type"] == "relation"}

result = {}
for bid, (t, i) in refs.items():
    nodes = way_nodes.get(i, []) if t == "way" else [n for w in rel_ways.get(i, []) for n in way_nodes.get(w, [])]
    doors = [node_info[n] for n in dict.fromkeys(nodes) if n in node_info]
    # Skip service/emergency-only doors when there are public ones.
    public = [d for d in doors if d[2] not in ("service", "emergency", "exit", "staff")]
    chosen = public or doors
    if chosen:
        result[bid] = [[round(a, 7), round(o, 7), k] for a, o, k in chosen]

out.write_text(json.dumps(result, indent=1), encoding="utf-8")
print(f"buildings with OSM outlines: {len(refs)}; with mapped entrances: {len(result)}")
for bid, doors in sorted(result.items()):
    print(f"  {bid:20} {len(doors)} doors: {', '.join(sorted(set(d[2] for d in doors)))}")
missing = sorted(set(refs) - set(result))
print("no entrances:", ", ".join(missing))
