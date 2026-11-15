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
function labelText(building, zoom) {
  if (zoom >= 18) return building.name;
  if (zoom >= 16.5) {
    const abbr = (building.abbr || [])[0];
    if (abbr) return abbr;
    return building.name.length <= 16 ? building.name : null;
  }
  return null;
}

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
    return out;
  }, [buildingById, footprints]);

  // Dark text on light maps; light text with a dark halo on dark, Odyssey and satellite maps.
  const labelTone = mapType === "hybrid" || (mapType === "roadmap" && mapStyle === "dark") ? "light" : "dark";

  const pins = useMemo(() => {
    const byId = new Map();
    for (const b of searchMatches) byId.set(b.id, b);
    for (const b of buildings) if (favoriteIds?.has(b.id)) byId.set(b.id, b);
    if (selected) byId.set(selected.id, selected);
    return [...byId.values()];
  }, [searchMatches, buildings, favoriteIds, selected]);

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
        const style = footprintStyle(props.category, isSelected, props.fillColor || props.strokeColor);
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
        labeled.map((building) => {
          const text = labelText(building, zoom);
          if (!text) return null;
          return (
            <MarkerF
              key={`label-${building.id}`}
              position={{ lat: building.labelLat, lng: building.labelLng }}
              clickable={false}
              zIndex={4}
              icon={{ url: BLANK_PIXEL, scaledSize: new g.Size(1, 1), anchor: new g.Point(0, 0), labelOrigin: new g.Point(0, 0) }}
              label={{
                text,
                className: `map-label map-label--${labelTone}`,
                fontWeight: "800",
                fontSize: zoom >= 18 ? "13px" : "12px",
                color: labelTone === "dark" ? "#0b1f3a" : "#ffffff",
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
