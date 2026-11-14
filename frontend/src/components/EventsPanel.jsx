import { calendarLinks } from "../calendar.js";

function formatWhen(start) {
  if (!start) return "Time TBA";
  try {
    return new Date(start).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return start;
  }
}

function AddToCalendarButton({ event }) {
  const { ics, google } = calendarLinks(event);
  const href = ics || google;

  if (!href) {
    return (
      <button type="button" className="btn calendar" disabled>
        No calendar link
      </button>
    );
  }

  return (
    <a className="btn calendar" href={href} target="_blank" rel="noreferrer">
      Add to calendar
    </a>
  );
}

export default function EventsPanel({ events, onFocusEvent, open, onToggle }) {
  return (
    <>
      {!open && (
        <button
          type="button"
          className="events-tab"
          onClick={onToggle}
          aria-expanded={false}
          aria-controls="events-sidebar"
        >
          Upcoming events
          {events.length > 0 && <span className="events-tab-count">{events.length}</span>}
        </button>
      )}

      <aside
        id="events-sidebar"
        className={`events-panel ${open ? "open" : ""}`}
        aria-hidden={!open}
      >
        <div className="events-panel-header">
          <div>
            <p className="events-kicker">On campus</p>
            <h2>Upcoming events</h2>
          </div>
          <button
            type="button"
            className="events-collapse"
            onClick={onToggle}
            aria-label="Close events"
          >
            ✕
          </button>
        </div>

        <ul className="events-list">
          {events.length === 0 && (
            <li className="events-empty">No upcoming on-campus events right now.</li>
          )}
          {events.map((event) => (
            <li key={event.id} className="event-card">
              <button
                type="button"
                className="event-focus"
                onClick={() => onFocusEvent?.(event)}
                disabled={event.lat == null || event.lng == null}
              >
                <span className="event-title">{event.title}</span>
                <span className="event-when">{formatWhen(event.start)}</span>
                {event.location && <span className="event-place">{event.location}</span>}
              </button>
              <div className="event-actions">
                <AddToCalendarButton event={event} />
                {event.url && (
                  <a className="event-more" href={event.url} target="_blank" rel="noreferrer">
                    Details
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
