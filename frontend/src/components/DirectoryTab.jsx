import { useMemo, useState } from "react";
import { categoryLabel } from "../categories.js";

const SAVED = "__saved";
// Chip order: campus buildings first, then the everyday places.
const ORDER = ["academic", "student_life", "admin", "athletics", "housing", "dining", "parking"];

export default function DirectoryTab({ buildings, selected, onSelect, favoriteIds, onToggleFavorite }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

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
      .filter((b) => (category === "all" ? true : category === SAVED ? favoriteIds.has(b.id) : b.category === category))
      .filter((b) => !needle || [b.name, b.id, b.address, b.note, ...(b.abbr || [])].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name));
  }, [buildings, category, query, favoriteIds]);

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
      <div className="filter-chips" role="group" aria-label="Place type">
        <button type="button" className="filter-chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
          All <span>{buildings.length}</span>
        </button>
        <button
          type="button"
          className="filter-chip cat-favorites"
          aria-pressed={category === SAVED}
          onClick={() => setCategory(SAVED)}
        >
          ★ Saved <span>{savedCount}</span>
        </button>
        {categories.map(([cat, n]) => (
          <button
            key={cat}
            type="button"
            className={`filter-chip cat-${cat}`}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >
            <i className="cat-dot" aria-hidden="true" />
            {categoryLabel(cat)} <span>{n}</span>
          </button>
        ))}
      </div>

      <p className="side-count">
        {visible.length} {visible.length === 1 ? "place" : "places"}
      </p>

      <ul className="dir-list">
        {visible.map((b) => {
          const fav = favoriteIds.has(b.id);
          return (
            <li key={b.id} className="dir-row">
              <button
                type="button"
                className="dir-item"
                aria-current={selected?.id === b.id ? "true" : undefined}
                onClick={() => onSelect(b)}
              >
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
        {visible.length === 0 && (
          <li className="side-empty">
            {category === SAVED
              ? "No saved places yet. Tap ☆ next to a building to save it."
              : "Nothing matches. Try another type or clear the filter."}
          </li>
        )}
      </ul>
    </div>
  );
}
