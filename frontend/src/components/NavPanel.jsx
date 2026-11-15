import { googleMapsUrl } from "../api.js";

// Arrow for each Google maneuver type.
const ARROWS = {
  TURN_LEFT: "↰",
  TURN_RIGHT: "↱",
  TURN_SLIGHT_LEFT: "↖",
  TURN_SLIGHT_RIGHT: "↗",
  TURN_SHARP_LEFT: "↙",
  TURN_SHARP_RIGHT: "↘",
  UTURN_LEFT: "↶",
  UTURN_RIGHT: "↷",
  ROUNDABOUT_LEFT: "↺",
  ROUNDABOUT_RIGHT: "↻",
  STRAIGHT: "↑",
  DEPART: "↑",
  NAME_CHANGE: "↑",
};

function fmtDistance(m) {
  const ft = m * 3.281;
  if (ft < 1000) return `${Math.max(10, Math.round(ft / 10) * 10)} ft`;
  return `${(ft / 5280).toFixed(1)} mi`;
}

const fmtClock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const MODES = [
  { id: "WALK", icon: "🚶", label: "Walk" },
  { id: "DRIVE", icon: "🚗", label: "Drive" },
];

export default function NavPanel({ nav, following, onRecenter, onEnd, onRetry, onModeChange, nearestParking }) {
  if (!nav) return null;
  const { dest, status, route, progress, error } = nav;
  const driving = nav.mode === "DRIVE";

  let banner;
  if (status === "locating") {
    banner = { icon: "◎", main: "Finding your location…", sub: "Allow location access if your browser asks." };
  } else if (status === "routing") {
    banner = { icon: "…", main: `Finding the best ${driving ? "driving" : "walking"} route…`, sub: dest.name };
  } else if (status === "error") {
    banner = { icon: "!", main: "Can't get directions right now", sub: error };
  } else if (status === "arrived") {
    banner = driving
      ? {
          icon: "✓",
          main: `You've arrived near ${dest.name}`,
          sub: nearestParking ? `Closest parking: ${nearestParking.name}. Check the signs for which permit it needs.` : "Park in a lot your permit allows.",
        }
      : { icon: "✓", main: `You've arrived at ${dest.name}`, sub: "Room numbers usually start with the floor number." };
  } else {
    const next = route.steps[progress.stepIdx + 1];
    banner = next
      ? { icon: ARROWS[next.maneuver] || "↑", dist: fmtDistance(progress.toNextM), main: next.text }
      : { icon: "⚑", dist: fmtDistance(progress.toNextM), main: `${dest.name} will be on your route` };
    if (nav.rerouting) banner.sub = "Off route. Finding a new path…";
  }

  const navigating = status === "navigating" && progress;
  const arriveAt = navigating ? new Date(Date.now() + progress.remainingS * 1000) : null;

  return (
    <>
      <div className={`nav-banner nav-banner--${status}`} role="status" aria-live="polite">
        <span className="nav-icon" aria-hidden="true">
          {banner.icon}
        </span>
        <div className="nav-text">
          {banner.dist && <span className="nav-dist">{banner.dist}</span>}
          <span className="nav-main">{banner.main}</span>
          {banner.sub && <span className="nav-sub">{banner.sub}</span>}
        </div>
      </div>

      <div className="nav-sheet">
        <div className="nav-modes" role="radiogroup" aria-label="Travel mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={nav.mode === m.id}
              className="nav-mode"
              onClick={() => onModeChange?.(m.id)}
            >
              <span aria-hidden="true">{m.icon}</span> {m.label}
            </button>
          ))}
        </div>
        <div className="nav-sheet-row">
          <div className="nav-eta">
            {navigating ? (
              <>
                <strong>{Math.max(1, Math.round(progress.remainingS / 60))} min</strong>
                <span>
                  {fmtDistance(progress.remainingM)} · arrive {fmtClock(arriveAt)}
                </span>
              </>
            ) : (
              <>
                <strong>{dest.name}</strong>
                <span>{driving ? "Driving directions" : "Walking directions"}</span>
              </>
            )}
          </div>
          <div className="nav-actions">
            {status === "error" && (
              <>
                <button type="button" className="nav-btn" onClick={onRetry}>
                  Try again
                </button>
                <a className="nav-btn" href={googleMapsUrl(dest)} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
              </>
            )}
            {navigating && !following && (
              <button type="button" className="nav-btn" onClick={onRecenter}>
                ◎ Re-center
              </button>
            )}
            <button type="button" className="nav-btn nav-btn--end" onClick={onEnd}>
              {status === "arrived" ? "Done" : "End"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
