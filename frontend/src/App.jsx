import { useEffect, useMemo, useState } from "react";
import CampusMap from "./components/CampusMap.jsx";
import BuildingSearch from "./components/BuildingSearch.jsx";
import BuildingDetail from "./components/BuildingDetail.jsx";
import EventsPanel from "./components/EventsPanel.jsx";
import { fetchEvents, fetchTraffic } from "./api.js";
import { nearbyEvents } from "./geo.js";
import buildingsData from "./data/buildings.json";
import footprintsData from "./data/building_footprints.json";

const UTA_CENTER = { lat: 32.7296, lng: -97.1135 };
const EMPTY_TRAFFIC = [];

export default function App() {
  // Buildings + outlines ship with the frontend (bundled JSON) so reload
  // does not wait on the API or Google for footprint geometry/colors.
  const [buildings] = useState(buildingsData);
  const [footprints] = useState(footprintsData);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focusPoint, setFocusPoint] = useState(null);
  const [query, setQuery] = useState("");
  const [showTraffic, setShowTraffic] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [traffic, setTraffic] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [trafficData, eventData] = await Promise.all([
          fetchTraffic(3),
          fetchEvents(7),
        ]);
        if (cancelled) return;
        setTraffic(trafficData);
        setEvents(eventData);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load campus events");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return buildings;
    return buildings.filter((b) => {
      const hay = [b.name, b.id, ...(b.abbr || [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [buildings, query]);

  // Don't auto-pin every building — only search matches (and the selected one in the map).
  const mapMarkers = useMemo(() => {
    const needle = query.trim();
    if (!needle) return [];
    return filtered;
  }, [query, filtered]);

  const selectedNearby = useMemo(
    () => (selected ? nearbyEvents(selected, events, 280) : []),
    [selected, events],
  );

  const upcomingOnCampus = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => {
        if (event.lat == null || event.lng == null) return false;
        if (!event.start) return true;
        const endMs = event.end ? Date.parse(event.end) : Date.parse(event.start) + 2 * 60 * 60 * 1000;
        return Number.isFinite(endMs) ? endMs >= now : true;
      })
      .slice(0, 40);
  }, [events]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-block">
          <p className="brand">MavMap</p>
          <p className="tagline">Find every building on campus</p>
        </div>
        <BuildingSearch
          query={query}
          onQueryChange={setQuery}
          results={filtered}
          onSelect={(building) => {
            setSelected(building);
            setFocusPoint(null);
            setQuery(building.name);
          }}
        />
        <label className="traffic-toggle">
          <input
            type="checkbox"
            checked={showTraffic}
            onChange={(e) => setShowTraffic(e.target.checked)}
          />
          Event traffic
          {traffic?.points?.length != null && (
            <span className="traffic-count">({traffic.points.length})</span>
          )}
        </label>
      </header>

      <main className="map-stage">
        {error && <div className="status-banner error">{error}</div>}

        <EventsPanel
          events={upcomingOnCampus}
          open={eventsOpen}
          onToggle={() => setEventsOpen((v) => !v)}
          onFocusEvent={(event) => {
            setFocusPoint({ lat: event.lat, lng: event.lng });
            const closest = buildings
              .map((b) => ({
                building: b,
                d: (b.lat - event.lat) ** 2 + (b.lng - event.lng) ** 2,
              }))
              .sort((a, b) => a.d - b.d)[0];
            if (closest && closest.d < 0.0004) {
              setSelected(closest.building);
            } else {
              setSelected(null);
            }
          }}
        />

        <CampusMap
          center={UTA_CENTER}
          buildings={buildings}
          markers={mapMarkers}
          footprints={footprints}
          selected={selected}
          focusPoint={focusPoint}
          onSelect={(building) => {
            setSelected(building);
            setFocusPoint(null);
          }}
          showTraffic={showTraffic}
          trafficPoints={traffic?.points ?? EMPTY_TRAFFIC}
        />
        {selected && (
          <BuildingDetail
            building={selected}
            nearbyEvents={selectedNearby}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}
