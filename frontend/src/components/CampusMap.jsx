import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

const mapContainerStyle = { width: "100%", height: "100%" };
const libraries = ["visualization"];

// Keep the camera on UTA + nearby streets (not all of Arlington).
const UTA_BOUNDS = {
  north: 32.7405,
  south: 32.7205,
  east: -97.0985,
  west: -97.1265,
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
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

export default function CampusMap({
  center,
  buildings,
  selected,
  onSelect,
  showTraffic,
  trafficPoints,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef(null);
  const heatmapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const mapCenter = useMemo(() => {
    if (selected) return { lat: selected.lat, lng: selected.lng };
    return center;
  }, [center, selected]);

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
                {b.name} ({(b.abbr || [])[0]})
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

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapCenter}
      zoom={selected ? 17 : 15.5}
      options={mapOptions}
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
        setMapReady(false);
      }}
    >
      {buildings.map((building) => (
        <MarkerF
          key={building.id}
          position={{ lat: building.lat, lng: building.lng }}
          title={`${building.name} (${(building.abbr || []).join(", ")})`}
          onClick={() => onSelect(building)}
          opacity={selected && selected.id !== building.id ? 0.55 : 1}
        />
      ))}
    </GoogleMap>
  );
}
