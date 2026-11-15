import { useState } from "react";
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

export default function NavPanel({ nav, following, onRecenter, onEnd, onRetry, onSimulate }) {
  const [showSteps, setShowSteps] = useState(false);
  if (!nav) return null;
  const { dest, status, route, progress, error } = nav;

  let banner;
  if (status === "locating") {
    banner = { icon: "◎", main: "Finding your location…", sub: "Allow location access if your browser asks." };
  } else if (status === "routing") {
    banner = { icon: "…", main: "Finding the best walking route…", sub: dest.name };
  } else if (status === "error") {
    banner = { icon: "!", main: "Can't navigate right now", sub: error };
  } else if (status === "arrived") {
    banner = { icon: "✓", main: `You've arrived at ${dest.name}`, sub: "Room numbers usually start with the floor number." };
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
        {showSteps && route && (
          <ol className="nav-steps">
            {route.steps.map((s, i) => (
              <li key={i} className={progress && i <= progress.stepIdx && status !== "arrived" ? (i === progress.stepIdx ? "is-now" : "is-done") : ""}>
                <span className="nav-step-icon" aria-hidden="true">
                  {ARROWS[s.maneuver] || "↑"}
                </span>
                <span>{s.text}</span>
                <small>{fmtDistance(s.distanceM)}</small>
              </li>
            ))}
          </ol>
        )}
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
                <span>Walking directions</span>
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
            {route && (
              <button type="button" className="nav-btn" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
                {showSteps ? "Hide steps" : "Steps"}
              </button>
            )}
            {navigating && !following && (
              <button type="button" className="nav-btn" onClick={onRecenter}>
                ◎ Re-center
              </button>
            )}
            {navigating && !nav.simulating && (
              <button type="button" className="nav-btn nav-btn--quiet" onClick={onSimulate} title="For testing on a computer: walks the route for you">
                Simulate walk
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
