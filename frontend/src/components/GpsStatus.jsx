import { useEffect, useState } from "react";

/** Small "GPS · ±8 m · 2s ago" readout so you can see live tracking is working. */
export default function GpsStatus({ accuracy, updatedAt, following }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secs = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = secs != null && secs > 30;
  return (
    <div className={`gps-status${stale ? " is-stale" : ""}`} role="status" aria-live="off">
      <span className="gps-dot" aria-hidden="true" />
      GPS{accuracy != null ? ` · ±${Math.round(accuracy)} m` : ""}
      {secs != null && ` · ${secs < 2 ? "now" : `${secs}s ago`}`}
      {following && " · following"}
    </div>
  );
}
