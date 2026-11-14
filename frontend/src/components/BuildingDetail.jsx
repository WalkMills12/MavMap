import { appleMapsUrl, googleMapsUrl } from "../api.js";

function formatWhen(start) {
  if (!start) return null;
  try {
    return new Date(start).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return start;
  }
}

export default function BuildingDetail({ building, onClose, nearbyEvents = [] }) {
  const apple = appleMapsUrl(building);
  const google = googleMapsUrl(building);

  return (
    <aside className="detail-panel" aria-live="polite">
      <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
        ×
      </button>
      <p className="detail-category">{building.category.replace("_", " ")}</p>
      <h2>{building.name}</h2>
      <p className="detail-abbr">{(building.abbr || []).join(" · ")}</p>
      <p className="detail-address">{building.address}</p>
      <div className="direction-actions">
        <a className="btn apple" href={apple} target="_blank" rel="noreferrer">
          Apple Maps
        </a>
        <a className="btn google" href={google} target="_blank" rel="noreferrer">
          Google Maps
        </a>
      </div>

      {nearbyEvents.length > 0 && (
        <section className="nearby-events">
          <h3>Nearby events</h3>
          <ul>
            {nearbyEvents.slice(0, 4).map((event) => (
              <li key={event.id}>
                {event.url ? (
                  <a href={event.url} target="_blank" rel="noreferrer">
                    {event.title}
                  </a>
                ) : (
                  <span>{event.title}</span>
                )}
                {event.location && <span className="event-meta">{event.location}</span>}
                {formatWhen(event.start) && (
                  <span className="event-meta">{formatWhen(event.start)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
