export default function TransitTab({ transit, error, showTransit, hiddenRoutes, onToggleTransit, onToggleRoute, onFocusStop }) {
  if (error) {
    return (
      <div className="side-section">
        <p className="side-empty side-error">Couldn't load shuttle routes. Check that the backend is running.</p>
      </div>
    );
  }
  if (!transit) {
    return (
      <div className="side-section">
        <p className="side-empty">Loading shuttle routes…</p>
      </div>
    );
  }

  return (
    <div className="side-section">
      <div className="transit-head">
        <h3 className="transit-title">{transit.name}</h3>
        <p className="side-count">
          Free for students, faculty, staff and guests. Schedules change by semester, so confirm on{" "}
          <a href={transit.info_url} target="_blank" rel="noreferrer">
            uta.edu
          </a>{" "}
          or call {transit.phone}.
        </p>
        <label className="prefs-check">
          <input type="checkbox" checked={showTransit} onChange={(e) => onToggleTransit(e.target.checked)} />
          <span>Show shuttle stops and routes on the map</span>
        </label>
      </div>

      <ul className="route-list">
        {transit.routes.map((route) => {
          const onMap = route.stops.length > 0;
          const visible = showTransit && onMap && !hiddenRoutes.includes(route.id);
          return (
            <li key={route.id} className="route-card" style={{ "--route": route.color }}>
              <div className="route-top">
                <span className="route-swatch" aria-hidden="true" />
                <div className="route-name">
                  <strong>{route.name} route</strong>
                  <span>{route.hours}</span>
                </div>
                {onMap && (
                  <label className="route-toggle">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={!showTransit}
                      onChange={() => onToggleRoute(route.id)}
                      aria-label={`Show ${route.name} route on map`}
                    />
                    <span>Map</span>
                  </label>
                )}
              </div>
              {route.note && <p className="route-note">{route.note}</p>}
              {onMap && (
                <ol className="stop-list">
                  {route.stops.map((id, i) => {
                    const stop = transit.stops[id];
                    return (
                      <li key={`${id}-${i}`}>
                        <button type="button" className="stop-btn" onClick={() => onFocusStop({ id, ...stop })}>
                          {stop.name}
                          {!stop.exact && <span className="stop-approx" title="Approximate stop location">≈</span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {route.unmapped_stops?.length > 0 && (
                <p className="route-note">Also stops at {route.unmapped_stops.join(", ")} (not on the map yet).</p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="side-count">
        ≈ marks an approximate stop location. Dashed lines connect stops in order and don't follow the exact streets the
        bus drives.
      </p>
    </div>
  );
}
