import { useMemo, useState } from "react";
import { categoryLabel } from "../categories.js";
import SwipeRow from "./SwipeRow.jsx";

export const SAVED = "__saved";
// Chip order: campus buildings first, then the everyday places.
const ORDER = ["academic", "student_life", "admin", "athletics", "housing", "dining", "parking", "campus"];

const isGarage = (b) => /garage/i.test(`${b.name} ${b.note || ""}`);

/**
 * Directory list with multi-select type chips: tap several types to see them together
 * (e.g. Dining + Parking), add ★ Saved to narrow to saved places, and tap All to clear.
 * `filters` is an array of category ids, plus SAVED; empty means everything.
 */
export default function DirectoryTab({ buildings, selected, onSelect, favoriteIds, onToggleFavorite, filters: filtersProp, onFiltersChange }) {
  const [localFilters, setLocalFilters] = useState([]);
  const filters = filtersProp ?? localFilters;
  const setFilters = (next) => {
    setLocalFilters(next);
    onFiltersChange?.(next);
  };
  const [query, setQuery] = useState("");

  const savedOnly = filters.includes(SAVED);
  const cats = useMemo(() => filters.filter((f) => f !== SAVED), [filters]);
  const toggle = (id) => setFilters(filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id]);

  const categories = useMemo(() => {
    const counts = new Map();
    for (const b of buildings) counts.set(b.category, (counts.get(b.category) || 0) + 1);
    const rank = (c) => (ORDER.includes(c) ? ORDER.indexOf(c) : ORDER.length);
    return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [buildings]);

  const savedCount = buildings.filter((b) => favoriteIds.has(b.id)).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return buildings
      .filter((b) => (cats.length ? cats.includes(b.category) : true))
      .filter((b) => !savedOnly || favoriteIds.has(b.id))
      .filter((b) => !needle || [b.name, b.id, b.address, b.note, ...(b.abbr || [])].join(" ").toLowerCase().includes(needle))
      // Natural order so Lot 9 < Lot 10 and F4 < F10.
      .sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [buildings, cats, savedOnly, query, favoriteIds]);

  // With types picked, the list gets a section per type (parking split into garages and lots).
  const groups = useMemo(() => {
    if (!cats.length) return [{ id: "all", label: null, test: () => true }];
    const ordered = categories.map(([c]) => c).filter((c) => cats.includes(c));
    const out = [];
    for (const c of ordered) {
      if (c === "parking") {
        // Split by who can park there, using UTA's lot numbers (F = faculty/staff).
        const lot = (b) => b.category === "parking" && !isGarage(b);
        const has = (b, kind) => (b.permit || []).includes(kind);
        out.push({ id: "garages", label: "Parking garages", test: (b) => b.category === "parking" && isGarage(b) });
        out.push({ id: "student-lots", label: "Student lots", test: (b) => lot(b) && has(b, "student") });
        out.push({ id: "faculty-lots", label: "Faculty & staff lots (F)", test: (b) => lot(b) && has(b, "faculty") && !has(b, "student") });
        out.push({ id: "resident-lots", label: "Resident lots", test: (b) => lot(b) && has(b, "resident") });
        out.push({ id: "other-lots", label: "Unnumbered parking", test: (b) => lot(b) && !b.lots?.length });
      } else {
        out.push({ id: c, label: categoryLabel(c), test: (b) => b.category === c });
      }
    }
    return out;
  }, [cats, categories]);

  const anyFilter = filters.length > 0;

  return (
    <div className="side-section">
      <input
        className="side-search"
        type="search"
        placeholder="Filter buildings, parking, dining, housing"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter the directory"
      />
      <SwipeRow className="filter-chips filter-chips--swipe" label="Place types (pick one or more)">
        <button type="button" className="filter-chip" aria-pressed={!anyFilter} onClick={() => setFilters([])}>
          All <span>{buildings.length}</span>
        </button>
        <button type="button" className="filter-chip cat-favorites" aria-pressed={savedOnly} onClick={() => toggle(SAVED)}>
          ★ Saved <span>{savedCount}</span>
        </button>
        {categories.map(([cat, n]) => (
          <button key={cat} type="button" className={`filter-chip cat-${cat}`} aria-pressed={cats.includes(cat)} onClick={() => toggle(cat)}>
            {cats.includes(cat) ? <i className="chip-check" aria-hidden="true">✓</i> : <i className="cat-dot" aria-hidden="true" />}
            {categoryLabel(cat)} <span>{n}</span>
          </button>
        ))}
      </SwipeRow>

      <p className="side-count">
        {visible.length} {visible.length === 1 ? "place" : "places"}
        {anyFilter ? (
          <>
            {" · "}
            <button type="button" className="link-btn" onClick={() => setFilters([])}>
              Clear filters
            </button>
          </>
        ) : (
          " · tap types to combine them"
        )}
      </p>

      {cats.includes("parking") && (
        <p className="prefs-note">
          Parking is outlined in blue with a <span className="p-sign">P</span> on the map. Most lots need a UTA permit: check the sign at the
          entrance or <a href="https://www.uta.edu/parking" target="_blank" rel="noreferrer">uta.edu/parking</a>.
        </p>
      )}

      {groups.map((group) => {
        const rows = visible.filter(group.test);
        if (group.label && !rows.length) return null;
        return (
          <section key={group.id} className="dir-group">
            {group.label && groups.length > 1 && (
              <h3 className="dir-group-title">
                {group.label} <span>{rows.length}</span>
              </h3>
            )}
            <DirList rows={rows} selected={selected} onSelect={onSelect} favoriteIds={favoriteIds} onToggleFavorite={onToggleFavorite} />
          </section>
        );
      })}
      {visible.length === 0 && (
        <p className="side-empty">
          {savedOnly && !savedCount ? "No saved places yet. Tap ☆ next to a building to save it." : "Nothing matches. Try other types or clear the filters."}
        </p>
      )}
    </div>
  );
}

function DirList({ rows, selected, onSelect, favoriteIds, onToggleFavorite }) {
  if (!rows.length) return null;
  return (
    <ul className="dir-list">
      {rows.map((b) => {
        const fav = favoriteIds.has(b.id);
        return (
          <li key={b.id} className="dir-row">
            <button type="button" className="dir-item" aria-current={selected?.id === b.id ? "true" : undefined} onClick={() => onSelect(b)}>
              <span className="dir-text">
                <span className="dir-name">{b.name}</span>
                <span className="dir-meta">
                  {categoryLabel(b.category)}
                  {b.abbr?.length ? ` · ${b.abbr[0]}` : ""}
                  {b.note ? ` · ${b.note}` : ""}
                  {b.address ? ` · ${b.address}` : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`star-toggle${fav ? " is-on" : ""}`}
              aria-pressed={fav}
              aria-label={fav ? `Remove ${b.name} from saved places` : `Save ${b.name}`}
              title={fav ? "Saved" : "Save"}
              onClick={() => onToggleFavorite(b.id)}
            >
              {fav ? "★" : "☆"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
