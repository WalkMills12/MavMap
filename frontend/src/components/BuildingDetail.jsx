import { useEffect, useRef } from "react";
import { appleMapsUrl, googleMapsUrl } from "../api.js";
import { useSwipeDown } from "../useSwipeDown.js";
import { categoryLabel } from "../categories.js";
import Photo from "./Photo.jsx";

function photoCredit(photo) {
  const who = [photo.author, photo.license].filter(Boolean).join(", ");
  return { text: `Photo: ${who ? `${who} · ` : ""}Wikimedia Commons`, href: photo.page };
}

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

export default function BuildingDetail({ building, onClose, nearbyEvents = [], isFavorite = false, onToggleFavorite, onNavigate }) {
  const apple = appleMapsUrl(building);
  const google = googleMapsUrl(building);
  const panelRef = useRef(null);
  useSwipeDown(panelRef, onClose); // phones: drag the panel down to close it

  // Share the panel's height (as --detail-h) so the chat bubble on phones can float just above it.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--detail-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--detail-h");
    };
  }, []);

  return (
    <aside ref={panelRef} className={`detail-panel${building.photo ? " has-photo" : ""}`} aria-live="polite">
      <div className="sheet-handle" aria-hidden="true" />
      <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
        ×
      </button>
      {/* The photo sits behind the title and fades into the panel, so they read as one piece. */}
      <div className={`detail-hero${building.photo ? " has-photo" : ""}`}>
        {building.photo && (
          <Photo
            key={building.id}
            src={building.photo.url}
            alt={`${building.name}`}
            className="building-photo"
            credit={photoCredit(building.photo)}
          />
        )}
        <div className="detail-hero-text">
          <p className="detail-category">{categoryLabel(building.category)}</p>
          <div className="detail-title-row">
            <h2>{building.name}</h2>
            {onToggleFavorite && (
              <button
                type="button"
                className={`star-toggle${isFavorite ? " is-on" : ""}`}
                aria-pressed={isFavorite}
                aria-label={isFavorite ? `Remove ${building.name} from saved places` : `Save ${building.name}`}
                title={isFavorite ? "Saved" : "Save"}
                onClick={() => onToggleFavorite(building.id)}
              >
                {isFavorite ? "★" : "☆"}
              </button>
            )}
          </div>
        </div>
      </div>
      {building.abbr?.length > 0 && <p className="detail-abbr">{building.abbr.join(" · ")}</p>}
      {building.note && <p className="detail-abbr">{building.note}</p>}
      {building.address && <p className="detail-address">{building.address}</p>}
      {onNavigate && (
        <button type="button" className="btn walk" onClick={() => onNavigate(building)}>
          <span aria-hidden="true">➤</span> Get directions
        </button>
      )}
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
