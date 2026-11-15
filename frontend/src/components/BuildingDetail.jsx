import { useEffect, useState } from "react";
import { appleMapsUrl, fetchBuildingInfo, googleMapsUrl } from "../api.js";
import { formatEventWhen } from "../calendar.js";
import { badgeFor, categoryLabel } from "../categories.js";
import { buildingPhotoLoader } from "../photos.js";
import CardPhoto from "./CardPhoto.jsx";

const infoCache = new Map(); // building id -> Promise<info | null>

function useBuildingInfo(building) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    setInfo(null);
    if (!building?.place_id) return;
    if (!infoCache.has(building.id)) {
      infoCache.set(building.id, fetchBuildingInfo(building.id).catch(() => null));
      // Hours change during the day; don't keep them forever.
      setTimeout(() => infoCache.delete(building.id), 15 * 60 * 1000);
    }
    let cancelled = false;
    infoCache.get(building.id).then((d) => !cancelled && setInfo(d));
    return () => {
      cancelled = true;
    };
  }, [building?.id, building?.place_id]);
  return info;
}

/** Open now / today's hours / website / phone, live from the building's Google listing. */
function LiveInfo({ building }) {
  const info = useBuildingInfo(building);
  const [showWeek, setShowWeek] = useState(false);
  if (!info || (!info.hours?.length && info.open_now == null && !info.website && !info.phone)) return null;

  // Google lists Monday first; JS getDay() is 0 = Sunday.
  const todayIdx = (new Date().getDay() + 6) % 7;
  const today = info.hours?.[todayIdx];
  const todayHours = today ? today.replace(/^[^:]+:\s*/, "") : null;

  return (
    <section className="detail-live">
      {(info.open_now != null || todayHours) && (
        <div className="detail-hours-row">
          {info.open_now != null && (
            <span className={`open-pill ${info.open_now ? "is-open" : "is-closed"}`}>{info.open_now ? "Open now" : "Closed now"}</span>
          )}
          {todayHours && <span className="detail-today">Today: {todayHours}</span>}
          {info.hours?.length > 1 && (
            <button type="button" className="link-btn" onClick={() => setShowWeek((v) => !v)} aria-expanded={showWeek}>
              {showWeek ? "Hide hours" : "All hours"}
            </button>
          )}
        </div>
      )}
      {showWeek && (
        <ul className="detail-week">
          {info.hours.map((h, i) => (
            <li key={h} className={i === todayIdx ? "is-today" : undefined}>
              {h}
            </li>
          ))}
        </ul>
      )}
      {(info.website || info.phone) && (
        <p className="detail-contact">
          {info.website && (
            <a href={info.website} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
          {info.phone && <span>{info.phone}</span>}
        </p>
      )}
      <p className="detail-source">Hours from Google Maps</p>
    </section>
  );
}

export default function BuildingDetail({
  building,
  onClose,
  nearbyEvents = [],
  isFavorite = false,
  onToggleFavorite,
  onNavigate,
  navigating = false,
}) {
  const apple = appleMapsUrl(building);
  const google = googleMapsUrl(building);

  return (
    <aside className={`detail-panel detail-panel--photo cat-${building.category}`} aria-live="polite">
      <CardPhoto
        key={building.id}
        load={buildingPhotoLoader(building, 800)}
        fallbackLabel={badgeFor(building)}
        className="detail-photo"
      />
      <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
        ×
      </button>
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
      <p className="detail-abbr">
        <span className={`detail-code cat-${building.category}`}>{badgeFor(building)}</span>
        {building.address && <span className="detail-address-inline">{building.address}</span>}
      </p>

      {(building.description || building.note) && (
        <p className="detail-desc">{building.description || building.note}</p>
      )}

      {building.offers?.length > 0 && (
        <section className="detail-offers">
          <h3>What's here</h3>
          <ul>
            {building.offers.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <LiveInfo building={building} />
      {onNavigate && (
        <button
          type="button"
          className={`btn gps-btn${navigating ? " is-on" : ""}`}
          onClick={() => onNavigate(building)}
          disabled={navigating}
        >
          <span aria-hidden="true">➤</span> {navigating ? "Navigating with GPS…" : "Walk here with live GPS"}
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
                <span className="event-meta">{formatEventWhen(event)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
