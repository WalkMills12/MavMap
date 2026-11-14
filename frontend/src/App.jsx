import { useEffect, useMemo, useState } from "react";
import CampusMap from "./components/CampusMap.jsx";
import BuildingSearch from "./components/BuildingSearch.jsx";
import BuildingDetail from "./components/BuildingDetail.jsx";
import { fetchBuildings, fetchEvents, fetchTraffic } from "./api.js";
import { nearbyEvents } from "./geo.js";

const UTA_CENTER = { lat: 32.7296, lng: -97.1135 };
const EMPTY_TRAFFIC = [];

export default function App() {
  const [buildings, setBuildings] = useState([]);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [showTraffic, setShowTraffic] = useState(true);
  const [traffic, setTraffic] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [buildingData, trafficData, eventData] = await Promise.all([
          fetchBuildings(),
          fetchTraffic(3),
          fetchEvents(1),
        ]);
        if (cancelled) return;
        setBuildings(buildingData);
        setTraffic(trafficData);
        setEvents(eventData);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load campus data");
        }
      } finally {
        if (!cancelled) setLoading(false);
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

  const selectedNearby = useMemo(
    () => (selected ? nearbyEvents(selected, events, 280) : []),
    [selected, events],
  );

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
        {loading && <div className="status-banner">Loading campus map…</div>}
        {error && <div className="status-banner error">{error}</div>}
        <CampusMap
          center={UTA_CENTER}
          buildings={buildings}
          selected={selected}
          onSelect={setSelected}
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
