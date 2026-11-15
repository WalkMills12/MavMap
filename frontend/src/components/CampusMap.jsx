import { useEffect, useMemo, useRef, useState } from "react";
import { CircleF, GoogleMap, InfoWindowF, MarkerF, PolygonF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { badgeFor } from "../categories.js";
import { footprintStyle, markerIconForCategory } from "../markerIcons.js";
import { decodePolyline } from "../navigation.js";
import { distanceMeters } from "../geo.js";
import { labelPoint } from "../mapGeometry.js";

const mapContainerStyle = { width: "100%", height: "100%" };
const libraries = ["visualization"];

// Keep the camera on UTA + nearby streets (not all of Arlington).
const UTA_BOUNDS = {
  north: 32.7405,
  south: 32.7205,
  east: -97.0985,
  west: -97.1265,
};

// Google's "night" style, used for the street view when the app is in dark mode.
const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#64779e" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#334e87" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f9ba5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#023e58" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2c6675" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
];

// "The Odyssey": campus drawn like an old sea chart — parchment land, wine-dark water, bronze roads.
const ODYSSEY_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#e3d2a8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a2f14" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3e7c8" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#9c6a24" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#d6c08f" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#a98446" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#d2bd8a" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#b9b27a" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#c99a52" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#8a5a1c" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#b07a34" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#3b1638" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#e7c46a" }] },
];

const MAP_STYLES = { dark: DARK_STYLE, odyssey: ODYSSEY_STYLE };

// Hide Google's own business/school pins and building names so MavMap's outlines and labels stand out.
// Street names stay. Applies to every theme, and to Satellite view's label layer too.
const CAMPUS_MAP_STYLES = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  // No Google text at all: street names, building names, neighborhoods. MavMap draws its own building names.
  { elementType: "labels", stylers: [{ visibility: "off" }] },
];



// Invisible 1×1 image used as the anchor for text-only label markers.
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** MavMap's own building name: full name zoomed in, abbreviation (or short name) a bit farther out. */
function labelText(building, zoom, phone = false) {
  // Parking gets a "P" badge, with UTA's lot number ("P 49", "P F10") once you zoom in a little;
  // the named garages show their name when zoomed all the way in.
  if (building.category === "parking") {
    if (zoom >= 18.5 && !building.lots?.length && !building.id.startsWith("lot-")) return building.name;
    if (zoom >= 16.5 && building.lots?.length) return `P ${building.lots.join("/")}`;
    return zoom >= 16 ? "P" : null;
  }
  // Names are big, so very long ones use their code until you zoom all the way in.
  if (zoom >= 18.5) return building.name;
  if (zoom >= 18) return building.name.length <= 26 || !building.abbr?.length ? building.name : building.abbr[0];
  if (zoom >= 16.5) {
    const abbr = (building.abbr || [])[0];
    if (abbr) return abbr;
    return building.name.length <= 16 ? building.name : null;
  }
  // Phones open zoomed out, so show building codes ("NH", "ERB") from the start.
  if (phone && zoom >= 14.5 && building.category !== "dining") return (building.abbr || [])[0] ?? null;
  return null;
}

// Rough on-screen box for a label, in world pixels at this zoom (Web Mercator), for overlap checks.
function labelBox(lat, lng, text, fontPx, zoom) {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  const badge = text === "P" || text.startsWith("P ");
  const w = badge ? text.length * fontPx * 0.62 + fontPx * 0.9 : text.length * fontPx * 0.62 + 6;
  const h = fontPx * (badge ? 1.6 : 1.15);
  return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
}

// Which labels to draw first when two would overlap: the selected place, then classrooms and the UC, then the rest.
const LABEL_RANK = { academic: 0, student_life: 1, athletics: 2, admin: 3, housing: 4, campus: 5, dining: 6, parking: 7 };


// GeoJSON footprints → Google Maps polygon paths.
function ringsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates[0] || []];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).map((poly) => poly[0] || []);
  return [];
}

const pathFromRing = (ring) => ring.map(([lng, lat]) => ({ lat, lng })); // GeoJSON is [lng, lat]

const OSM_TYPE_ID = "osm";

const baseOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false, // map type is chosen in Preferences
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  minZoom: 14,
  maxZoom: 19,
  restriction: {
    latLngBounds: UTA_BOUNDS,
    strictBounds: true,
  },
};

function dashedLine(color) {
  return {
    strokeOpacity: 0,
    icons: [
      {
        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 3 },
        offset: "0",
        repeat: "14px",
      },
    ],
    clickable: false,
    zIndex: 1,
  };
}

export default function CampusMap({
  center,
  buildings,
  footprints, // GeoJSON FeatureCollection of building outlines
  searchMatches = [], // buildings matching the search box get pins while you type
  showOutlines = true, // building highlights (Preferences)
  showNames = true, // MavMap building names (Preferences)
  focusCategories = [], // place types picked in the Directory: their outlines stand out, the rest fade
  selected,
  onSelect,
  showTraffic,
  trafficPoints,
  mapType = "roadmap",
  mapStyle = "dark", // "dark" | "odyssey" | null (Google's default light map)
  favoriteIds,
  transit,
  shownRoutes = [], // bus route ids the user turned on (none by default)
  focusStop,
  onFocusStop,
  navigating = false, // walking navigation is active
  navPath = null, // [{lat, lng}] route to draw
  userPos = null, // { lat, lng, acc, heading }
  following = false, // keep the map centered on the user
  onUserPan, // the user dragged the map (stop following)
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef(null);
  const heatmapRef = useRef(null);
  const osmCreditRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(15.5);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const mapCenter = useMemo(() => {
    if (focusStop) return { lat: focusStop.lat, lng: focusStop.lng };
    if (selected) return { lat: selected.lat, lng: selected.lng };
    return center;
  }, [center, selected, focusStop]);

  const options = useMemo(
    () => ({
      ...baseOptions,
      // Theme colors only apply to Street view; hiding Google's names also works on Satellite's labels.
      styles:
        mapType === "roadmap"
          ? [...(MAP_STYLES[mapStyle] ?? []), ...CAMPUS_MAP_STYLES]
          : mapType === "hybrid"
            ? CAMPUS_MAP_STYLES
            : null,
      // While navigating you may start off campus, so don't lock the camera to UTA.
      ...(navigating ? { restriction: null, minZoom: 3 } : {}),
    }),
    [mapStyle, mapType, navigating],
  );
  const odyssey = mapStyle === "odyssey";

  // Navigation: zoom in once when it starts, then keep the user in view while following.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !navigating) return;
    map.setZoom(18);
  }, [navigating, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !navigating || !following || !userPos) return;
    map.panTo({ lat: userPos.lat, lng: userPos.lng });
  }, [userPos, following, navigating, mapReady]);

  // Phones: the building panel covers the bottom of the map, so nudge the map until the picked
  // building sits in the middle of the part you can still see, above the panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selected || navigating) return;
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    let raf2 = 0;
    // Wait two frames so the panel has rendered and the map has applied its new center/zoom.
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const panel = document.querySelector(".detail-panel");
        const mapEl = map.getDiv();
        const panelH = panel ? panel.getBoundingClientRect().height : mapEl.clientHeight * 0.45;
        const covered = Math.min(panelH + 12, mapEl.clientHeight * 0.75); // panel height plus its gap
        map.setCenter({ lat: selected.lat, lng: selected.lng });
        map.panBy(0, covered / 2);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [selected, mapReady, navigating]);

  // Restore the campus camera limits after navigation ends.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || navigating) return;
    map.setOptions({ restriction: baseOptions.restriction, minZoom: baseOptions.minZoom });
  }, [navigating, mapReady]);

  // Register the OpenStreetMap tile layer once, then switch map types when the preference changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !mapReady) return;
    const g = window.google.maps;
    if (!map.mapTypes.get(OSM_TYPE_ID)) {
      map.mapTypes.set(
        OSM_TYPE_ID,
        new g.ImageMapType({
          getTileUrl: (coord, zoom) => `https://tile.openstreetmap.org/${zoom}/${coord.x}/${coord.y}.png`,
          tileSize: new g.Size(256, 256),
          maxZoom: 19,
          name: "OpenStreetMap",
          alt: "OpenStreetMap",
        }),
      );
      // OSM's tile policy requires visible attribution.
      const credit = document.createElement("div");
      credit.className = "osm-credit";
      credit.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
      map.controls[g.ControlPosition.BOTTOM_RIGHT].push(credit);
      osmCreditRef.current = credit;
    }
    map.setMapTypeId(mapType === "osm" ? OSM_TYPE_ID : mapType === "hybrid" ? g.MapTypeId.HYBRID : g.MapTypeId.ROADMAP);
    if (osmCreditRef.current) osmCreditRef.current.style.display = mapType === "osm" ? "block" : "none";
  }, [mapType, isLoaded, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !mapReady) return;

    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }

    if (!showTraffic || !trafficPoints.length) return;
    if (!window.google?.maps?.visualization?.HeatmapLayer) return;

    try {
      const data = trafficPoints.map((point) => ({
        location: new window.google.maps.LatLng(point.lat, point.lng),
        weight: point.weight,
      }));

      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data,
        map,
        radius: 48,
        opacity: 0.65,
      });
    } catch (err) {
      console.warn("Heatmap unavailable:", err);
    }

    return () => {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
        heatmapRef.current = null;
      }
    };
  }, [showTraffic, trafficPoints, isLoaded, mapReady]);

  // Which routes serve each stop, for stop colors and the info window.
  const buildingById = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);

  // Name every outlined building, centered inside its outline (cafes inside the UC etc. have no outline).
  const labeled = useMemo(() => {
    const out = [];
    for (const f of footprints?.features || []) {
      const b = buildingById.get(f.properties?.id);
      if (!b) continue;
      const rings = ringsFromGeometry(f.geometry);
      const p = rings.length ? labelPoint(rings) : null;
      out.push({ ...b, labelLat: p?.lat ?? b.lat, labelLng: p?.lng ?? b.lng });
    }
    // Numbered lots from UTA's parking map that have no outline still get their "P" badge.
    const outlined = new Set(out.map((b) => b.id));
    for (const b of buildingById.values()) {
      if (b.category === "parking" && b.lots?.length && !outlined.has(b.id)) out.push({ ...b, labelLat: b.lat, labelLng: b.lng });
    }
    return out;
  }, [buildingById, footprints]);

  // Dark text on light maps; light text with a dark halo on dark, Odyssey and satellite maps.
  const labelTone = mapType === "hybrid" || (mapType === "roadmap" && mapStyle === "dark") ? "light" : "dark";

  // Pick the labels to draw: text and size for this zoom, skipping any that would sit on top of one
  // already placed (more important places go first), so names stay readable instead of piling up.
  // Bold names with codes from the starting zoom on every device (began as the phone style).
  const phone = true;
  const visibleLabels = useMemo(() => {
    const z = Math.round(zoom * 2) / 2;
    const candidates = [];
    for (const b of labeled) {
      const text = labelText(b, z, phone);
      if (!text) continue;
      const badge = text === "P" || text.startsWith("P ");
      const fontPx = badge ? 17 : phone ? (z >= 17 ? 24 : 22) : z >= 18 ? 26 : 24;
      const rank = selected?.id === b.id ? -1 : badge ? 9 : (LABEL_RANK[b.category] ?? 8) + (b.abbr?.length ? 0 : 0.5);
      candidates.push({ b, text, badge, fontPx, rank, box: labelBox(b.labelLat, b.labelLng, text, fontPx, z) });
    }
    candidates.sort((a, c) => a.rank - c.rank);
    const placed = [];
    for (const c of candidates) {
      const hit = placed.some((p) => c.box.x0 < p.box.x1 && c.box.x1 > p.box.x0 && c.box.y0 < p.box.y1 && c.box.y1 > p.box.y0);
      if (!hit) placed.push(c);
    }
    return placed;
  }, [labeled, zoom, phone, selected]);

  const pins = useMemo(() => {
    const byId = new Map();
    // Saved places don't get a permanent pin: only search matches and the place you have open.
    for (const b of searchMatches) byId.set(b.id, b);
    if (selected) byId.set(selected.id, selected);
    return [...byId.values()];
  }, [searchMatches, selected]);

  const visibleRoutes = useMemo(() => {
    if (!transit) return [];
    return transit.routes
      .filter((r) => r.stops.length && shownRoutes.includes(r.id))
      // Road-following path saved in transit.json; fall back to straight stop-to-stop lines if missing.
      .map((r) => ({ ...r, roadPath: r.path ? decodePolyline(r.path) : null }));
  }, [transit, shownRoutes]);

  const stopRoutes = useMemo(() => {
    const map = new Map();
    for (const r of visibleRoutes) {
      for (const id of r.stops) {
        if (!map.has(id)) map.set(id, []);
        if (!map.get(id).includes(r)) map.get(id).push(r);
      }
    }
    return map;
  }, [visibleRoutes]);

  if (!apiKey) {
    return (
      <div className="map-fallback">
        <p>
          Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>frontend/.env</code> to
          load the map.
        </p>
        <ul>
          {buildings.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => onSelect(b)}>
                {b.name} ({badgeFor(b)})
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (loadError) {
    return <div className="map-fallback error">Failed to load Google Maps.</div>;
  }

  if (!isLoaded) {
    return <div className="map-fallback">Loading Google Maps…</div>;
  }

  const g = window.google.maps;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={selected || focusStop ? 17 : 15.5}
      options={options}
      onLoad={(map) => {
        mapRef.current = map;
        setMapReady(true);
      }}
      onDragStart={() => onUserPan?.()}
      onZoomChanged={() => {
        const z = mapRef.current?.getZoom();
        if (Number.isFinite(z)) setZoom(z);
      }}
      onUnmount={() => {
        if (heatmapRef.current) {
          heatmapRef.current.setMap(null);
          heatmapRef.current = null;
        }
        mapRef.current = null;
        osmCreditRef.current = null;
        setMapReady(false);
      }}
    >
      {navPath?.length > 1 && (
        <>
          <PolylineF path={navPath} options={{ strokeColor: "#ffffff", strokeOpacity: 1, strokeWeight: 10, zIndex: 20, clickable: false }} />
          <PolylineF path={navPath} options={{ strokeColor: "#1a73e8", strokeOpacity: 1, strokeWeight: 6, zIndex: 21, clickable: false }} />
          {/* Walking routes end on the nearest path; dot the last few meters to the building itself. */}
          {selected && distanceMeters(navPath[navPath.length - 1], selected) > 5 && (
            <PolylineF
              path={[navPath[navPath.length - 1], { lat: selected.lat, lng: selected.lng }]}
              options={{
                strokeOpacity: 0,
                zIndex: 21,
                clickable: false,
                icons: [{ icon: { path: g.SymbolPath.CIRCLE, scale: 2.5, fillColor: "#1a73e8", fillOpacity: 1, strokeOpacity: 0 }, offset: "0", repeat: "10px" }],
              }}
            />
          )}
        </>
      )}

      {userPos && (
        <>
          <CircleF
            center={{ lat: userPos.lat, lng: userPos.lng }}
            radius={Math.min(userPos.acc || 0, 150)}
            options={{ fillColor: "#1a73e8", fillOpacity: 0.12, strokeColor: "#1a73e8", strokeOpacity: 0.3, strokeWeight: 1, clickable: false, zIndex: 30 }}
          />
          {Number.isFinite(userPos.heading) && (
            <MarkerF
              position={{ lat: userPos.lat, lng: userPos.lng }}
              clickable={false}
              zIndex={31}
              icon={{
                path: g.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 5,
                rotation: userPos.heading,
                anchor: new g.Point(0, 5.5),
                fillColor: "#1a73e8",
                fillOpacity: 0.85,
                strokeColor: "#ffffff",
                strokeWeight: 1.5,
              }}
            />
          )}
          <MarkerF
            position={{ lat: userPos.lat, lng: userPos.lng }}
            title="You are here"
            clickable={false}
            zIndex={32}
            icon={{ path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 }}
          />
        </>
      )}

      {visibleRoutes
        .filter((route) => route.roadPath)
        .map((route) => (
          <PolylineF
            key={`${route.id}-edge`}
            path={route.roadPath}
            options={{ strokeColor: "#ffffff", strokeOpacity: 0.75, strokeWeight: 8, zIndex: 1, clickable: false }}
          />
        ))}
      {visibleRoutes.map((route) =>
        route.roadPath ? (
          <PolylineF
            key={route.id}
            path={route.roadPath}
            options={{
              strokeColor: route.color,
              strokeOpacity: 0.95,
              strokeWeight: 5,
              zIndex: 2,
              clickable: false,
            }}
          />
        ) : (
          <PolylineF
            key={route.id}
            path={route.stops.map((id) => transit.stops[id]).map((s) => ({ lat: s.lat, lng: s.lng }))}
            options={dashedLine(route.color)}
          />
        ),
      )}

      {[...stopRoutes.entries()].map(([id, routes]) => {
        const stop = transit.stops[id];
        return (
          <MarkerF
            key={`stop-${id}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={`${stop.name} shuttle stop (${routes.map((r) => r.name).join(", ")})`}
            zIndex={2}
            onClick={() => onFocusStop?.({ id, ...stop })}
            icon={{
              path: g.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeColor: routes[0].color,
              strokeWeight: 3,
            }}
          />
        );
      })}

      {focusStop && (
        <InfoWindowF position={{ lat: focusStop.lat, lng: focusStop.lng }} onCloseClick={() => onFocusStop?.(null)}>
          <div className="stop-info">
            <strong>{focusStop.name}</strong>
            <span>
              MavMover {(stopRoutes.get(focusStop.id) || []).map((r) => r.name).join(" · ") || "shuttle"} stop
            </span>
            {!focusStop.exact && <span className="stop-info-note">Approximate stop location</span>}
          </div>
        </InfoWindowF>
      )}

      {/* Building outlines, colored by type; tap one to open the building. */}
      {showOutlines && (footprints?.features || []).map((feature) => {
        const props = feature.properties || {};
        const building = buildingById.get(props.id);
        const isSelected = selected?.id === props.id;
        const emphasis = focusCategories.length ? (focusCategories.includes(props.category) ? "focus" : "dim") : undefined;
        const style = footprintStyle(props.category, isSelected, props.fillColor || props.strokeColor, emphasis);
        return ringsFromGeometry(feature.geometry).map((ring, i) => (
          <PolygonF
            key={`${props.id}-${i}`}
            paths={pathFromRing(ring)}
            options={{ ...style, strokeColor: isSelected ? (odyssey ? "#fff3c4" : "#ffffff") : style.strokeColor }}
            onClick={() => building && onSelect(building)}
          />
        ));
      })}

      {/* MavMap's bold building names, drawn on the buildings (Google's own names are hidden). */}
      {showNames &&
        visibleLabels.map(({ b: building, text, badge, fontPx }) => {
          return (
            <MarkerF
              key={`label-${building.id}`}
              position={{ lat: building.labelLat, lng: building.labelLng }}
              clickable={false}
              zIndex={badge ? 3 : 4}
              icon={{ url: BLANK_PIXEL, scaledSize: new g.Size(1, 1), anchor: new g.Point(0, 0), labelOrigin: new g.Point(0, 0) }}
              label={{
                text,
                className: badge ? "map-label map-label--parking" : `map-label map-label--${labelTone}${phone ? " map-label--phone" : ""}`,
                fontWeight: phone ? "900" : "800",
                fontSize: `${fontPx}px`,
                color: badge ? "#ffffff" : labelTone === "dark" ? "#0b1f3a" : "#ffffff",
              }}
            />
          );
        })}

      {/* Pins only where they help: search matches, saved places and the selected building. */}
      {pins.map((building) => {
        const isSelected = selected?.id === building.id;
        const isFav = favoriteIds?.has(building.id);
        const pin = markerIconForCategory(building.category, isSelected);
        return (
          <MarkerF
            key={`pin-${building.id}`}
            position={{ lat: building.lat, lng: building.lng }}
            title={`${building.name}${building.abbr?.length ? ` (${building.abbr.join(", ")})` : ""}${isFav ? " ★ saved" : ""}`}
            onClick={() => onSelect(building)}
            zIndex={isSelected ? 1000 : isFav ? 5 : 3}
            icon={{
              url: pin.url,
              scaledSize: new g.Size(pin.scaledSize.width, pin.scaledSize.height),
              anchor: new g.Point(pin.anchor.x, pin.anchor.y),
              labelOrigin: new g.Point(pin.scaledSize.width / 2, pin.scaledSize.width * 0.48),
            }}
            label={isFav ? { text: "★", color: "#0B1F3A", fontSize: isSelected ? "15px" : "12px", fontWeight: "700" } : undefined}
          />
        );
      })}
    </GoogleMap>
  );
}
