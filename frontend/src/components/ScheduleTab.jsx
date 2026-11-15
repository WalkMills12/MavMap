import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRoute, getCurrentLocation } from "../navigation.js";
import {
  DAY_LETTERS,
  DAY_NAMES,
  dayLabel,
  describeLocation,
  formatDays,
  formatMinutes,
  nextClass,
  parseScheduleText,
  pdfToText,
} from "../schedule.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const BUFFER_MIN = 5; // aim to arrive this early
const fmtClock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const toTimeInput = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromTimeInput = (v) => {
  const [h, m] = String(v).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// Classes can run from 8:00 AM to 9:00 PM, no later.
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;

/** Why a start/end pair isn't allowed, or "" if it's fine. */
function timeError(s, e) {
  if (s == null || e == null) return "Add a start and end time.";
  if (s < DAY_START) return "Classes can't start before 8:00 AM.";
  if (e > DAY_END) return "Classes have to end by 9:00 PM.";
  if (s >= DAY_END) return "Classes can't start at or after 9:00 PM.";
  if (e <= s) return "The start time has to be before the end time.";
  return "";
}

function fmtDuration(s) {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function fmtMiles(m) {
  const mi = m / 1609.34;
  return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(1)} mi`;
}

function startsIn(startsAt, now) {
  const min = Math.round((startsAt - now) / 60000);
  if (min < 60) return `in ${min} min`;
  if (min < 60 * 24) return `in ${Math.floor(min / 60)} h ${min % 60} min`;
  return "";
}

/** Add or edit one class. */
function ClassForm({ initial, buildings, onSave, onCancel }) {
  const [course, setCourse] = useState(initial?.course ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [days, setDays] = useState(initial?.days ?? []);
  const [start, setStart] = useState(initial ? toTimeInput(initial.start) : "09:00");
  const [end, setEnd] = useState(initial ? toTimeInput(initial.end) : "10:00");
  // Changing the start time moves the end to one hour later, capped at 9 PM (you can still change the end after).
  const changeStart = (value) => {
    setStart(value);
    const s = fromTimeInput(value);
    if (s != null) setEnd(toTimeInput(Math.min(s + 60, DAY_END)));
  };
  const startMin = fromTimeInput(start);
  const endMin = fromTimeInput(end);
  const timeProblem = timeError(startMin, endMin);
  const timesInvalid = Boolean(timeProblem);
  const [buildingId, setBuildingId] = useState(initial?.buildingId ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [online, setOnline] = useState(Boolean(initial?.online));
  const [error, setError] = useState("");

  const options = useMemo(
    () => buildings.filter((b) => !["dining", "parking"].includes(b.category)).sort((a, b) => a.name.localeCompare(b.name)),
    [buildings],
  );

  const submit = (e) => {
    e.preventDefault();
    const s = fromTimeInput(start);
    const en = fromTimeInput(end);
    if (!course.trim()) return setError("Add the course, like CSE 1310.");
    if (!days.length) return setError("Pick at least one day.");
    const problem = timeError(s, en);
    if (problem) return setError(problem); // never saved
    onSave({
      ...(initial || {}),
      course: course.trim().toUpperCase().replace(/^([A-Z]{2,5})\s*(\d{4})$/, "$1 $2"),
      title: title.trim(),
      days: [...days].sort((a, b) => a - b),
      start: s,
      end: en,
      buildingId: online ? "" : buildingId,
      room: online ? "" : room.trim().toUpperCase(),
      online,
    });
  };

  return (
    <form className="class-form" onSubmit={submit}>
      <div className="class-form-row">
        <label>
          <span>Course</span>
          <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="CSE 1310" autoComplete="off" />
        </label>
        <label className="grow">
          <span>Name (optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intro to Programming" autoComplete="off" />
        </label>
      </div>
      <div className="class-form-days" role="group" aria-label="Days">
        {DAY_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            className="day-toggle"
            aria-pressed={days.includes(d)}
            aria-label={DAY_NAMES[d]}
            onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
          >
            {DAY_LETTERS[d]}
          </button>
        ))}
      </div>
      <div className="class-form-row">
        <label>
          <span>Starts</span>
          <input type="time" min="08:00" max="21:00" value={start} onChange={(e) => changeStart(e.target.value)} aria-invalid={timesInvalid || undefined} />
        </label>
        <label>
          <span>Ends</span>
          <input type="time" min="08:00" max="21:00" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={timesInvalid || undefined} />
        </label>
      </div>
      <p className={timesInvalid ? "class-error" : "prefs-note"}>{timeProblem || "Classes run between 8:00 AM and 9:00 PM."}</p>
      <label className="prefs-check">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        <span>Online class</span>
      </label>
      {!online && (
        <div className="class-form-row">
          <label className="grow">
            <span>Building</span>
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
              <option value="">Choose a building</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.abbr?.[0] ? ` (${b.abbr[0]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Room</span>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="106" autoComplete="off" />
          </label>
        </div>
      )}
      {error && <p className="class-error">{error}</p>}
      <div className="class-form-actions">
        <button type="submit" className="nav-btn nav-btn--primary" disabled={timesInvalid}>
          {initial?.id ? "Save changes" : "Add class"}
        </button>
        <button type="button" className="nav-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "Next class" card with live travel time from where you are now. */
function NextClassCard({ next, buildings, apiKey, mode, onModeChange, onShowBuilding, onNavigate, now }) {
  const cls = next.cls;
  const building = buildings.find((b) => b.id === cls.buildingId);
  const [eta, setEta] = useState({ status: "idle" });
  const reqRef = useRef(0);

  const check = useCallback(async () => {
    if (!building) return;
    const id = ++reqRef.current;
    setEta({ status: "locating" });
    try {
      const from = await getCurrentLocation();
      if (id !== reqRef.current) return;
      setEta({ status: "routing" });
      const route = await fetchRoute(apiKey, from, building, mode);
      if (id !== reqRef.current) return;
      setEta({ status: "ok", durationS: route.durationS, distanceM: route.totalM, mode, at: new Date() });
    } catch (err) {
      if (id === reqRef.current) setEta({ status: "error", error: err.message });
    }
  }, [apiKey, building, mode]);

  // If location is already allowed, work out the travel time straight away (and again when the mode changes).
  useEffect(() => {
    setEta({ status: "idle" });
    let cancelled = false;
    navigator.permissions
      ?.query?.({ name: "geolocation" })
      .then((p) => !cancelled && p.state === "granted" && check())
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [check]);

  let advice = null;
  if (eta.status === "ok") {
    const travelS = eta.durationS + (eta.mode === "DRIVE" ? 5 * 60 : 0); // driving: time to park and walk in
    const arrive = new Date(eta.at.getTime() + travelS * 1000);
    const leaveBy = new Date(next.startsAt.getTime() - travelS * 1000 - BUFFER_MIN * 60000);
    if (next.inProgress) advice = `Class started at ${fmtClock(next.startsAt)}. You'd get there at ${fmtClock(arrive)}.`;
    else if (leaveBy > now) advice = `Leave by ${fmtClock(leaveBy)} to get there ${BUFFER_MIN} min early.`;
    else if (arrive <= next.startsAt) advice = `Leave now: you'd arrive at ${fmtClock(arrive)}, just in time.`;
    else advice = `Leave now: you'd arrive at ${fmtClock(arrive)}, about ${Math.ceil((arrive - next.startsAt) / 60000)} min late.`;
  }

  return (
    <section className="next-class" aria-label="Next class">
      <p className="side-kicker">{next.inProgress ? "Happening now" : "Next class"}</p>
      <h3>
        {cls.course}
        {cls.component ? <small> {cls.component}</small> : null}
      </h3>
      {cls.title && <p className="next-class-title">{cls.title}</p>}
      <p className="next-class-when">
        {dayLabel(next.startsAt, now)} · {formatMinutes(cls.start)} to {formatMinutes(cls.end)}
        {!next.inProgress && startsIn(next.startsAt, now) ? ` · starts ${startsIn(next.startsAt, now)}` : ""}
      </p>
      <p className="next-class-where">{describeLocation(cls, buildings)}</p>

      {building && (
        <>
          <div className="next-class-eta">
            <div className="nav-modes nav-modes--small" role="radiogroup" aria-label="Travel mode">
              {[
                ["WALK", "🚶 Walk"],
                ["DRIVE", "🚗 Drive"],
              ].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} className="nav-mode" onClick={() => onModeChange(id)}>
                  {label}
                </button>
              ))}
            </div>
            {eta.status === "idle" && (
              <button type="button" className="nav-btn" onClick={check}>
                ◎ How long from here?
              </button>
            )}
            {(eta.status === "locating" || eta.status === "routing") && <p className="eta-line">{eta.status === "locating" ? "Finding your location…" : "Working out the route…"}</p>}
            {eta.status === "ok" && (
              <div className="eta-result" aria-live="polite">
                <p className="eta-line">
                  <strong>{fmtDuration(eta.durationS)}</strong> {eta.mode === "DRIVE" ? "drive" : "walk"} · {fmtMiles(eta.distanceM)} from you
                  {eta.mode === "DRIVE" ? " (plus time to park)" : ""}
                </p>
                {advice && <p className="eta-advice">{advice}</p>}
                <button type="button" className="link-btn" onClick={check}>
                  Refresh
                </button>
              </div>
            )}
            {eta.status === "error" && (
              <p className="class-error">
                {eta.error}{" "}
                <button type="button" className="link-btn" onClick={check}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className="class-actions">
            <button type="button" className="btn walk" onClick={() => onNavigate(building)}>
              <span aria-hidden="true">➤</span> Get directions
            </button>
            <button type="button" className="nav-btn" onClick={() => onShowBuilding(building)}>
              Show on map
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function ScheduleTab({ buildings, schedule, apiKey, travelMode, onTravelModeChange, onShowBuilding, onNavigate }) {
  const { classes, add, update, remove, replaceAll } = schedule;
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(null); // class id, "new", or null
  const [importState, setImportState] = useState({ status: "idle" }); // idle | reading | review | error
  const [pasted, setPasted] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(""), 5000);
    return () => clearTimeout(t);
  }, [savedNote]);

  /**
   * Save an edited class and carry the change to every other meeting of the same course:
   * course name and title always; times, and building/room, only where they matched the old ones
   * (so a lab at another time or in another room keeps its own). Days stay per meeting.
   * Returns how many other meetings were updated.
   */
  const updateSection = (original, patch) => {
    const key = (c) => c.course.trim().toUpperCase().replace(/\s+/g, " ");
    const shared = { course: patch.course, title: patch.title };
    let others = 0;
    replaceAll(
      classes.map((c) => {
        if (c.id === original.id) return { ...c, ...patch };
        if (key(c) !== key(original)) return c;
        others += 1;
        // Times and place only follow where they matched before, so a lab in another room or at another time keeps its own.
        const sameTimes = c.start === original.start && c.end === original.end;
        const samePlace = c.buildingId === original.buildingId && c.room === original.room && Boolean(c.online) === Boolean(original.online);
        return {
          ...c,
          ...shared,
          ...(sameTimes ? { start: patch.start, end: patch.end } : {}),
          ...(samePlace ? { buildingId: patch.buildingId, room: patch.room, online: patch.online } : {}),
        };
      }),
    );
    return others;
  };

  // Keep "starts in…" and the next class current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const next = useMemo(() => nextClass(classes, now), [classes, now]);

  const byDay = useMemo(
    () =>
      DAY_ORDER.map((d) => ({
        day: d,
        items: classes.filter((c) => c.days.includes(d)).sort((a, b) => a.start - b.start),
      })).filter((g) => g.items.length),
    [classes],
  );

  const importText = (text, source) => {
    const found = parseScheduleText(text, buildings);
    if (!found.length) {
      setImportState({
        status: "error",
        error: `I couldn't find any class meeting times in ${source}. Make sure it shows days and times like “MoWe 1:00PM - 2:20PM”, or add your classes by hand below.`,
      });
      return;
    }
    setImportState({ status: "review", found, source });
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportState({ status: "reading", name: file.name });
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const text = isPdf ? await pdfToText(file) : await file.text();
      importText(text, `“${file.name}”`);
    } catch (err) {
      setImportState({
        status: "error",
        error: `Couldn't read “${file.name}”. ${/password/i.test(err?.message || "") ? "It's password protected." : "If it's a scanned image, paste the text or add classes by hand."}`,
      });
    }
  };

  const saveImport = (mode) => {
    if (mode === "replace") replaceAll(importState.found);
    else add(importState.found);
    setImportState({ status: "idle" });
    setPasted("");
  };

  return (
    <div className="side-section schedule-tab">
      {next ? (
        <NextClassCard
          key={`${next.cls.id}-${next.startsAt.getTime()}`}
          next={next}
          buildings={buildings}
          apiKey={apiKey}
          mode={travelMode}
          onModeChange={onTravelModeChange}
          onShowBuilding={onShowBuilding}
          onNavigate={onNavigate}
          now={now}
        />
      ) : (
        classes.length === 0 && (
          <div className="schedule-empty">
            <p>
              <strong>Add your class schedule</strong> and MavMap shows which building and floor each class is in, plus how long it takes to get
              there from where you are.
            </p>
          </div>
        )
      )}

      {/* Import */}
      <section className="schedule-import" aria-label="Import your schedule">
        <div className="class-actions">
          <button type="button" className="btn walk" onClick={() => fileRef.current?.click()} disabled={importState.status === "reading"}>
            {importState.status === "reading" ? "Reading…" : "⬆ Upload schedule PDF"}
          </button>
          <button type="button" className="nav-btn" onClick={() => setEditing("new")}>
            + Add a class
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf,text/plain,.txt" hidden onChange={onFile} />
        <p className="prefs-note">
          From MyMav: Student Center → My Class Schedule → print or save as PDF. The file is read on this device and never uploaded.
        </p>
        <details className="paste-box">
          <summary>Or paste your schedule text</summary>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            placeholder={"CSE 1310-001 Lecture MoWe 1:00PM - 2:20PM NH 106\nMATH 1426 TuTh 11:00AM - 12:20PM Pickard Hall 110"}
          />
          <button type="button" className="nav-btn" disabled={!pasted.trim()} onClick={() => importText(pasted, "that text")}>
            Read schedule
          </button>
        </details>

        {importState.status === "error" && <p className="class-error">{importState.error}</p>}
        {importState.status === "review" && (
          <div className="import-review">
            <p>
              Found <strong>{importState.found.length}</strong> {importState.found.length === 1 ? "class" : "classes"} in {importState.source}. Check them:
            </p>
            <ul className="class-list">
              {importState.found.map((c) => (
                <li key={c.id} className={!c.buildingId && !c.online ? "needs-building" : ""}>
                  <strong>{c.course}</strong> {c.component && <small>{c.component}</small>}
                  <span>
                    {formatDays(c.days)} · {formatMinutes(c.start)} to {formatMinutes(c.end)}
                  </span>
                  <span>{describeLocation(c, buildings)}</span>
                </li>
              ))}
            </ul>
            {importState.found.some((c) => !c.buildingId && !c.online) && (
              <p className="prefs-note">Classes marked “Building not set” can be fixed with ✎ after saving.</p>
            )}
            <div className="class-actions">
              {classes.length > 0 ? (
                <>
                  <button type="button" className="nav-btn nav-btn--primary" onClick={() => saveImport("replace")}>
                    Replace my schedule
                  </button>
                  <button type="button" className="nav-btn" onClick={() => saveImport("add")}>
                    Add to it
                  </button>
                </>
              ) : (
                <button type="button" className="nav-btn nav-btn--primary" onClick={() => saveImport("add")}>
                  Save schedule
                </button>
              )}
              <button type="button" className="nav-btn" onClick={() => setImportState({ status: "idle" })}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {editing === "new" && (
        <ClassForm
          buildings={buildings}
          onSave={(c) => {
            add(c);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {savedNote && (
        <p className="prefs-note" role="status">
          ✓ {savedNote}
        </p>
      )}

      {/* The week */}
      {byDay.map((g) => (
        <section key={g.day} className="class-day">
          <h3 className="class-day-title">{DAY_NAMES[g.day]}</h3>
          <ul className="class-list">
            {g.items.map((c) => {
              const b = buildings.find((x) => x.id === c.buildingId);
              if (editing === c.id) {
                return (
                  <li key={c.id}>
                    <ClassForm
                      initial={c}
                      buildings={buildings}
                      onSave={(patch) => {
                        const others = updateSection(c, patch);
                        setEditing(null);
                        setSavedNote(others ? `Also updated ${others} other ${patch.course} ${others === 1 ? "meeting" : "meetings"}.` : "");
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </li>
                );
              }
              return (
                <li key={c.id} className={`class-row${next?.cls.id === c.id ? " is-next" : ""}${!b && !c.online ? " needs-building" : ""}`}>
                  <span className="class-time">
                    {formatMinutes(c.start)}
                    <small>{formatMinutes(c.end)}</small>
                  </span>
                  <button type="button" className="class-main" onClick={() => b && onShowBuilding(b)} disabled={!b}>
                    <strong>
                      {c.course}
                      {c.component ? <small> {c.component}</small> : null}
                    </strong>
                    {c.title && <span className="class-title">{c.title}</span>}
                    <span className="class-where">{describeLocation(c, buildings)}</span>
                  </button>
                  <span className="class-row-actions">
                    {b && (
                      <button type="button" className="icon-btn" title="Get directions" aria-label={`Get directions to ${c.course}`} onClick={() => onNavigate(b)}>
                        ➤
                      </button>
                    )}
                    <button type="button" className="icon-btn" title="Edit" aria-label={`Edit ${c.course}`} onClick={() => setEditing(c.id)}>
                      ✎
                    </button>
                    <button type="button" className="icon-btn" title="Remove" aria-label={`Remove ${c.course} on ${DAY_NAMES[g.day]}`} onClick={() => remove(c.id)}>
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {classes.length > 0 && (
        <div className="prefs-actions">
          <ClearButton onConfirm={() => replaceAll([])} />
        </div>
      )}
    </div>
  );
}

function ClearButton({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`prefs-reset${armed ? " is-armed" : ""}`}
      onClick={() => {
        if (armed) onConfirm();
        setArmed(!armed);
      }}
    >
      {armed ? "Tap again to clear" : "Clear my schedule"}
    </button>
  );
}
