import { useEffect, useRef } from "react";
import { downloadIcs, eventLocation, eventPhoto, formatEventTime, googleCalendarUrl } from "../calendar.js";
import Photo from "./Photo.jsx";

function dayLabel(event) {
  const d = new Date(event.all_day ? `${event.start.slice(0, 10)}T12:00:00` : event.start);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function reasonText(s) {
  if (s.reasons.length) return `Because you like ${s.reasons.slice(0, 2).join(" and ")} events`;
  if (s.place) return `At ${s.place}, where you've saved events before`;
  return "Based on events you've saved";
}

export default function SuggestionPopup({ suggestions, calendarPref, isSaved, onSave, onCalendar, onViewAll, onTurnOff, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.querySelector("button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="suggest-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="suggest-dialog" role="dialog" aria-modal="true" aria-labelledby="suggest-title" ref={dialogRef}>
        <header className="suggest-head">
          <div>
            <p className="suggest-kicker">New since your last visit</p>
            <h2 id="suggest-title" className="suggest-title">
              Events you might like
            </h2>
          </div>
          <button type="button" className="side-close" onClick={onClose} aria-label="Close suggestions">
            ×
          </button>
        </header>

        <ul className="suggest-list">
          {suggestions.map((s) => {
            const e = s.event;
            const saved = isSaved(e.id);
            return (
              <li key={e.id} className="event-card">
                <Photo src={eventPhoto(e)} className="event-photo" />
                <p className="event-time">
                  {dayLabel(e)} · {formatEventTime(e)}
                </p>
                <h3 className="event-title">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.title}
                    </a>
                  ) : (
                    e.title
                  )}
                </h3>
                {eventLocation(e) && <p className="event-where">{eventLocation(e)}</p>}
                <p className="suggest-reason">{reasonText(s)}</p>
                <div className="event-actions">
                  <button type="button" className={`cal-btn star-btn${saved ? " is-on" : ""}`} aria-pressed={saved} onClick={() => onSave(e)}>
                    {saved ? "★ Saved" : "☆ Save"}
                  </button>
                  {calendarPref !== "apple" && (
                    <a className="cal-btn" href={googleCalendarUrl(e)} target="_blank" rel="noreferrer" onClick={() => onCalendar(e)}>
                      + Google Calendar
                    </a>
                  )}
                  {calendarPref !== "google" && (
                    <button
                      type="button"
                      className="cal-btn"
                      onClick={() => {
                        downloadIcs(e);
                        onCalendar(e);
                      }}
                    >
                      + Apple Calendar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="suggest-foot">
          <button type="button" className="prefs-reset" onClick={onTurnOff}>
            Stop suggesting events
          </button>
          <div className="suggest-foot-main">
            <button type="button" className="prefs-reset" onClick={onClose}>
              Not now
            </button>
            <button type="button" className="faq-send" onClick={onViewAll}>
              See all events
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
