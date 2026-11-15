import { formatDistance, formatMinutes } from "../geo.js";

/** Floating banner at the top of the map while live GPS / walking navigation is on. */
export default function NavBanner({ target, status, error, route, remaining, arrived, onStop }) {
  let title;
  let detail;
  if (status === "error") {
    title = "Location unavailable";
    detail = error;
  } else if (status === "locating") {
    title = target ? `Walking to ${target.name}` : "Finding you…";
    detail = "Waiting for your location…";
  } else if (arrived) {
    title = `You've arrived at ${target.name}`;
    detail = target.address || null;
  } else if (target) {
    title = `Walking to ${target.name}`;
    if (route) {
      detail = `${formatMinutes(route.duration_s)} · ${formatDistance(route.distance_m)}${route.approximate ? " (straight-line estimate)" : ""}`;
    } else if (remaining != null) {
      detail = `${formatDistance(remaining)} away · getting route…`;
    }
  }

  return (
    <div className={`nav-banner${arrived ? " is-arrived" : ""}${status === "error" ? " is-error" : ""}`} role="status" aria-live="polite">
      <span className="nav-icon" aria-hidden="true">
        {arrived ? "✓" : status === "error" ? "!" : "➤"}
      </span>
      <span className="nav-text">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </span>
      <button type="button" className="nav-stop" onClick={onStop}>
        {arrived ? "Done" : target ? "End" : "Close"}
      </button>
    </div>
  );
}
