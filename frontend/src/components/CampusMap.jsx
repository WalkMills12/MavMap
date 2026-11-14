import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, InfoWindowF, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { CATEGORY_COLORS, badgeFor } from "../categories.js";

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

  const mapCenter = useMemo(() => {
    if (focusStop) return { lat: focusStop.lat, lng: focusStop.lng };
    if (selected) return { lat: selected.lat, lng: selected.lng };
    return center;
  }, [center, selected, focusStop]);

  const options = useMemo(
    () => ({ ...baseOptions, styles: mapType === "roadmap" ? MAP_STYLES[mapStyle] ?? null : null }),
    [mapStyle, mapType],
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

  // Which routes serve each stop, for stop colors and the info window.
  const visibleRoutes = useMemo(() => {
    if (!transit || !showTransit) return [];
    return transit.routes.filter((r) => r.stops.length && !hiddenRoutes.includes(r.id));
  }, [transit, showTransit, hiddenRoutes]);

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
            opacity={selected && !isSelected ? 0.6 : 1}
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
