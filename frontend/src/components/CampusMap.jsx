import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolygonF, useJsApiLoader } from "@react-google-maps/api";
import { footprintStyle, markerIconForCategory } from "../markerIcons.js";

const mapContainerStyle = { width: "100%", height: "100%" };
const libraries = ["visualization"];

const UTA_BOUNDS = {
  north: 32.7405,
  south: 32.7205,
  east: -97.0985,
  west: -97.1265,
};

const CAMPUS_MAP_STYLES = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
];

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  styles: CAMPUS_MAP_STYLES,
  minZoom: 14,
  maxZoom: 19,
  restriction: {
    latLngBounds: UTA_BOUNDS,
    strictBounds: true,
  },
};

function ringsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return [geometry.coordinates[0] || []];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((poly) => poly[0] || []);
  }
  return [];
}

function pathFromRing(ring) {
  // GeoJSON is [lng, lat]
  return ring.map(([lng, lat]) => ({ lat, lng }));
}

export default function CampusMap({
  center,
  buildings,
  markers = [],
  footprints,
  selected,
  focusPoint,
  onSelect,
  showTraffic,
  trafficPoints,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef(null);
  const heatmapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const buildingById = useMemo(() => {
    const map = new Map();
    for (const building of buildings) map.set(building.id, building);
    return map;
  }, [buildings]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });

  const mapCenter = useMemo(() => {
    if (focusPoint) return focusPoint;
    if (selected) return { lat: selected.lat, lng: selected.lng };
    return center;
  }, [center, selected, focusPoint]);

  const pins = useMemo(() => {
    const byId = new Map();
    for (const building of markers) byId.set(building.id, building);
    if (selected) byId.set(selected.id, selected);
    return Array.from(byId.values());
  }, [markers, selected]);

  const footprintFeatures = footprints?.features || [];

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
      zoom={selected || focusPoint ? 17 : 15.5}
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
      {footprintFeatures.map((feature) => {
        const props = feature.properties || {};
        const building = buildingById.get(props.id);
        const isSelected = selected?.id === props.id;
        const style = footprintStyle(
          props.category,
          isSelected,
          props.fillColor || props.strokeColor,
        );
        const rings = ringsFromGeometry(feature.geometry);

        return rings.map((ring, index) => (
          <PolygonF
            key={`${props.id}-${index}`}
            paths={pathFromRing(ring)}
            options={style}
            onClick={() => {
              if (building) onSelect(building);
            }}
          />
        ));
      })}

      {pins.map((building) => {
        const isSelected = selected?.id === building.id;
        return (
          <MarkerF
            key={`pin-${building.id}`}
            position={{ lat: building.lat, lng: building.lng }}
            title={`${building.name} (${(building.abbr || []).join(", ")})`}
            onClick={() => onSelect(building)}
            icon={markerIconForCategory(building.category, isSelected)}
            zIndex={isSelected ? 1000 : 2}
          />
        );
      })}
    </GoogleMap>
  );
}
