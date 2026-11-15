export default function TransitTab({ transit, error, shownRoutes, onSetAll, onToggleRoute, onFocusStop }) {
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

  const mappable = transit.routes.filter((r) => r.stops.length);
  const allOn = mappable.length > 0 && mappable.every((r) => shownRoutes.includes(r.id));

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
          <input type="checkbox" checked={allOn} onChange={(e) => onSetAll(e.target.checked)} />
          <span>Show all routes on the map</span>
        </label>
        <p className="side-count">Routes stay hidden until you turn them on. Tap a stop to see it on the map.</p>
      </div>

      <ul className="route-list">
        {transit.routes.map((route) => {
          const onMap = route.stops.length > 0;
          const visible = onMap && shownRoutes.includes(route.id);
          return (
            <li key={route.id} className={`route-card${visible ? " is-shown" : ""}`} style={{ "--route": route.color }}>
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
                      onChange={() => onToggleRoute(route.id)}
                      aria-label={`Show ${route.name} route on map`}
                    />
                    <span>Show</span>
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
                        <button type="button" className="stop-btn" onClick={() => onFocusStop({ id, ...stop }, route.id)}>
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
        ≈ marks an approximate stop location. Route lines follow the roads between stops; the bus may take slightly
        different streets.
      </p>
    </div>
  );
}
