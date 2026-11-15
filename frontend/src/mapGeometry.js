// Geometry helpers for the campus map.

/**
 * Where to put a building's name so it sits in the middle of the building, even for L- and U-shaped ones:
 * the interior point farthest from the edges (a "pole of inaccessibility"), found with a coarse-to-fine grid.
 */
export function labelPoint(rings) {
  const area = (r) => {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += (r[i][0] - r[0][0]) * (r[i + 1][1] - r[0][1]) - (r[i + 1][0] - r[0][0]) * (r[i][1] - r[0][1]);
    return Math.abs(a);
  };
  const ring = rings.reduce((a, b) => (area(b) > area(a) ? b : a)); // multi-part places: label the largest part
  const KX = 93800, KY = 111320; // meters per degree near UTA
  const pts = ring.map(([lng, lat]) => [lng * KX, lat * KY]);
  const inside = ([x, y]) => {
    let inn = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
    }
    return inn;
  };
  const edgeDist = ([x, y]) => {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return d;
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  let best = null;
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, w = maxX - minX, h = maxY - minY;
  for (let pass = 0; pass < 3; pass++) {
    const n = 14;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p = [cx - w / 2 + (w * i) / n, cy - h / 2 + (h * j) / n];
        if (!inside(p)) continue;
        const d = edgeDist(p);
        if (!best || d > best.d) best = { p, d };
      }
    }
    if (!best) break;
    [cx, cy] = best.p;
    w /= 4;
    h /= 4;
  }
  if (!best) return null;
  return { lng: best.p[0] / KX, lat: best.p[1] / KY };
}
