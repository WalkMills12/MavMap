import { useEffect, useMemo, useRef, useState } from "react";
import { badgeFor, categoryLabel, categoryShort } from "../categories.js";
import { searchEvents, searchPlaces } from "../search.js";
import { formatEventWhen } from "../calendar.js";

const SUGGESTIONS = ["basketball", "printing", "coffee", "parking", "food", "gym", "library", "dorms"];

export default function BuildingSearch({ query, onQueryChange, index, events = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const { results, corrected } = useMemo(() => searchPlaces(index, query, { limit: 8 }), [index, query]);
  const eventHits = useMemo(() => searchEvents(events, corrected || query, 3), [events, corrected, query]);

  // Rows the arrow keys move through: places first, then events.
  const rows = useMemo(
    () => [...results.map((r) => ({ kind: "place", r })), ...eventHits.map((e) => ({ kind: "event", e }))],
    [results, eventHits],
  );

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (row) => {
    if (!row) return;
    if (row.kind === "place") {
      onSelect(row.r.building);
      setOpen(false);
      inputRef.current?.blur();
    } else if (row.e.url) {
      window.open(row.e.url, "_blank", "noopener");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="search-wrap" ref={wrapRef}>
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder="Search anything: NH, basketball, printing, coffee…"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-label="Search campus"
        autoComplete="off"
        spellCheck="false"
      />

      {open && (
        <div className="search-results" id="search-results" role="listbox">
          {!hasQuery && (
            <div className="search-suggest">
              <p className="search-section">Try searching for</p>
              <div className="search-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="search-chip"
                    onClick={() => {
                      onQueryChange(s);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasQuery && corrected && (
            <p className="search-corrected">
              Showing results for <strong>{corrected}</strong>
            </p>
          )}

          {hasQuery && results.length > 0 && <p className="search-section">Places</p>}
          {results.map((r, i) => (
            <button
              key={r.building.id}
              type="button"
              role="option"
              aria-selected={active === i}
              className={`search-row${active === i ? " is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(rows[i])}
            >
              <span className={`search-badge cat-${r.building.category}`}>{badgeFor(r.building)}</span>
              <span className="search-text">
                <span className="result-name">{r.building.name}</span>
                <span className="result-abbr">
                  {r.hint ? `Matches “${r.hint}”` : r.building.note || r.building.description || r.building.address || ""}
                </span>
              </span>
              <span
                className={`search-cat cat-${r.building.category}`}
                title={categoryLabel(r.building.category)}
              >
                {categoryShort(r.building.category)}
              </span>
            </button>
          ))}

          {eventHits.length > 0 && <p className="search-section">Events</p>}
          {eventHits.map((e, j) => {
            const i = results.length + j;
            return (
              <button
                key={`ev-${e.id}`}
                type="button"
                role="option"
                aria-selected={active === i}
                className={`search-row${active === i ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(rows[i])}
              >
                <span className="search-badge search-badge--event" aria-hidden="true">
                  ★
                </span>
                <span className="search-text">
                  <span className="result-name">{e.title}</span>
                  <span className="result-abbr">
                    {formatEventWhen(e)}
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </span>
              </button>
            );
          })}

          {hasQuery && rows.length === 0 && (
            <p className="empty">Nothing on campus matches “{query.trim()}”. Try a building name or what you need, like “printing”.</p>
          )}
        </div>
      )}
    </div>
  );
}
