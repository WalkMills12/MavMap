import { useEffect, useMemo, useRef, useState } from "react";
import { CircleF, GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORY_COLORS, badgeFor } from "../categories.js";
import { snapToPath } from "../geo.js";
import { useAnimatedPosition } from "../useAnimatedPosition.js";
import { useIsMobile } from "../useIsMobile.js";

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

const OSM_TYPE_ID = "osm";
const INITIAL_ZOOM = 15.5;

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
  selected,
  onSelect,
  showTraffic,
  trafficPoints,
  mapType = "roadmap",
  mapStyle = "dark", // "dark" | "odyssey" | null (Google's default light map)
  favoriteIds,
  transit,
  showTransit = true,
  hiddenRoutes = [],
  focusStop,
  onFocusStop,
  userPosition = null, // { lat, lng, accuracy, heading } from live GPS
  routePath = null, // [{ lat, lng }] walking route to draw
  routeEnd = null, // { lat, lng } the door / side of the building the walk ends at
  routeEndKind = null, // "door" | "side" | "center"
  navigating = false, // keep the map following the walker
  recenterKey = 0, // bump to jump the map back to the user
  onFollowChange, // (following: boolean) => void
  navTargetId = null, // building being walked to (kept bright while others fade)
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef(null);
  const heatmapRef = useRef(null);
  const osmCreditRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  // The map is positioned imperatively: it moves when you pick a building or stop, and stays
  // where it is when you close a card (instead of snapping back to the whole campus).
  const [initialCenter] = useState(center);
  const focus = focusStop || selected;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focus) return;
    map.panTo({ lat: focus.lat, lng: focus.lng });
    if (map.getZoom() < 17) map.setZoom(17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.lat, focus?.lng, mapReady]);

  // Where to draw "you are here": on the walking route when you're within 20 m of it (so GPS
  // wobble doesn't pull you off the path), gliding smoothly between fixes.
  const dotTarget = useMemo(() => {
    if (!userPosition || !navigating || !routePath) return userPosition;
    const s = snapToPath(userPosition, routePath);
    return s && s.distance <= 20 ? { ...userPosition, lat: s.lat, lng: s.lng } : userPosition;
  }, [userPosition, navigating, routePath]);
  const shownPosition = useAnimatedPosition(dotTarget);
  if (import.meta.env.DEV && typeof window !== "undefined") window.__mavmapDot = shownPosition; // for GPS tests

  const mobile = useIsMobile();
  const options = useMemo(
    () => ({
      ...baseOptions,
      // Phones pinch to zoom; Google's buttons would sit on top of ours.
      zoomControl: !mobile,
      cameraControl: false,
      gestureHandling: "greedy", // one-finger pan on phones (no "use two fingers" overlay)
      styles: mapType === "roadmap" ? MAP_STYLES[mapStyle] ?? null : null,
    }),
    [mapStyle, mapType, mobile],
  );
  const odyssey = mapStyle === "odyssey";

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

  // Live GPS follow mode (like Google Maps): keep the walker centered as they move. Dragging the
  // map or opening a building stops following; the locate button (recenterKey) starts it again.
  const followRef = useRef(false);
  const hadFixRef = useRef(false);
  const setFollow = (on) => {
    if (followRef.current !== on) {
      followRef.current = on;
      onFollowChange?.(on);
    }
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const l = map.addListener("dragstart", () => setFollow(false));
    return () => l.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  useEffect(() => {
    if (recenterKey || navigating) setFollow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey, navigating]);

  // Looking at a building: let the map stay there instead of snapping back to you.
  useEffect(() => {
    if (selected && !navigating) setFollow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!dotTarget) {
      hadFixRef.current = false;
      return;
    }
    const first = !hadFixRef.current;
    hadFixRef.current = true;
    if (first || followRef.current) {
      map.panTo({ lat: dotTarget.lat, lng: dotTarget.lng });
      if (first && map.getZoom() < 17) map.setZoom(17);
    }
  }, [dotTarget, mapReady, recenterKey]);

  // New walk: frame you, the path and the door together, close enough that campus walkways show.
  const framedRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !routePath?.length || !routeEnd || !navigating) {
      if (!navigating) framedRef.current = null;
      return;
    }
    const key = `${navTargetId}:${routeEnd.lat.toFixed(5)},${routeEnd.lng.toFixed(5)}`;
    if (framedRef.current === key) return;
    framedRef.current = key;
    const g = window.google.maps;
    const bounds = new g.LatLngBounds();
    for (const p of routePath) bounds.extend(p);
    bounds.extend(routeEnd);
    if (userPosition) bounds.extend(userPosition);
    map.fitBounds(bounds, { top: 110, bottom: 90, left: 40, right: 40 });
    g.event.addListenerOnce(map, "idle", () => {
      const z = map.getZoom();
      if (z > 19) map.setZoom(19);
      else if (z < 17) map.setZoom(17);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePath, routeEnd, navigating, mapReady, navTargetId]);

  // Which routes serve each stop, for stop colors and the info window.
  const visibleRoutes = useMemo(() => {
    if (!transit || !showTransit || navigating) return []; // keep the walk uncluttered
    return transit.routes.filter((r) => r.stops.length && !hiddenRoutes.includes(r.id));
  }, [transit, showTransit, hiddenRoutes, navigating]);

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
      center={initialCenter}
      zoom={INITIAL_ZOOM}
      options={options}
      onLoad={(map) => {
        mapRef.current = map;
        setMapReady(true);
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
      {visibleRoutes.map((route) => (
        <PolylineF
          key={route.id}
          path={route.stops.map((id) => transit.stops[id]).map((s) => ({ lat: s.lat, lng: s.lng }))}
          options={dashedLine(route.color)}
        />
      ))}

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

      {routePath?.length > 1 && routeEnd && (
        <>
          {/* Last few steps from the walkway to the door */}
          <PolylineF path={[routePath[routePath.length - 1], routeEnd]} options={{ ...dashedLine("#1a73e8"), zIndex: 22 }} />
          <MarkerF
            position={routeEnd}
            title={routeEndKind === "door" ? "Entrance" : "Destination"}
            zIndex={900}
            clickable={false}
            icon={{
              path: "M -6 -9 L 6 -9 L 6 9 L -6 9 Z M -2 1 L -2 1", // door
              scale: 1,
              fillColor: routeEndKind === "door" ? "#188038" : "#1a73e8",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2.5,
            }}
          />
        </>
      )}
      {routePath?.length > 1 && (
        <>
          <PolylineF
            path={routePath}
            options={{ strokeColor: "#ffffff", strokeOpacity: 0.9, strokeWeight: 9, clickable: false, zIndex: 20 }}
          />
          <PolylineF
            path={routePath}
            options={{ strokeColor: "#1a73e8", strokeOpacity: 1, strokeWeight: 5, clickable: false, zIndex: 21 }}
          />
        </>
      )}

      {shownPosition && (
        <>
          <CircleF
            center={{ lat: shownPosition.lat, lng: shownPosition.lng }}
            radius={Math.min(shownPosition.accuracy || 0, 200)}
            options={{
              strokeColor: "#1a73e8",
              strokeOpacity: 0.35,
              strokeWeight: 1,
              fillColor: "#1a73e8",
              fillOpacity: 0.12,
              clickable: false,
              zIndex: 30,
            }}
          />
          <MarkerF
            position={{ lat: shownPosition.lat, lng: shownPosition.lng }}
            title="You are here"
            zIndex={1000}
            clickable={false}
            icon={
              shownPosition.heading != null
                ? {
                    // Arrow pointing the way you're walking.
                    path: g.SymbolPath.FORWARD_CLOSED_ARROW,
                    scale: 6,
                    rotation: shownPosition.heading,
                    fillColor: "#1a73e8",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2.5,
                  }
                : {
                    path: g.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#1a73e8",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                  }
            }
          />
        </>
      )}

      {buildings.map((building) => {
        const isSelected = selected?.id === building.id;
        const isFav = favoriteIds?.has(building.id);
        return (
          <MarkerF
            key={building.id}
            position={{ lat: building.lat, lng: building.lng }}
            title={`${building.name}${building.abbr?.length ? ` (${building.abbr.join(", ")})` : ""}${isFav ? " ★" : ""}`}
            onClick={() => onSelect(building)}
            zIndex={isSelected ? 10 : isFav ? 5 : 3}
            opacity={navigating ? (building.id === navTargetId ? 1 : 0.35) : selected && !isSelected ? 0.6 : 1}
            icon={{
              path: g.SymbolPath.CIRCLE,
              scale: isSelected ? 11 : 8,
              fillColor: CATEGORY_COLORS[building.category] || "#f3f0e8",
              fillOpacity: 1,
              strokeColor: isFav ? "#ffd447" : odyssey ? "#3b2412" : "#0b1f3a",
              strokeWeight: isFav ? 4 : isSelected ? 3 : odyssey ? 2 : 1.5,
            }}
          />
        );
      })}
    </GoogleMap>
  );
}
