import { useMemo, useState } from "react";
import { badgeFor, categoryLabel, categoryShort } from "../categories.js";
import { googleMapsUrl } from "../api.js";
import { buildingPhotoLoader } from "../photos.js";
import { buildIndex, searchPlaces } from "../search.js";
import CardPhoto from "./CardPhoto.jsx";

const SAVED = "__saved";
// Chip order: campus buildings first, then the everyday places.
const ORDER = ["academic", "student_life", "admin", "athletics", "recreation", "housing", "dining", "parking"];

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

  const index = useMemo(() => buildIndex(buildings), [buildings]);

  // Same smart search as the top bar (keywords + spelling fixes); best matches first.
  const { visible, corrected } = useMemo(() => {
    const inCategory = (b) =>
      category === "all" ? true : category === SAVED ? favoriteIds.has(b.id) : b.category === category;
    if (query.trim()) {
      const { results, corrected } = searchPlaces(index, query, { limit: buildings.length });
      return { visible: results.map((r) => r.building).filter(inCategory), corrected };
    }
    const list = buildings
      .filter(inCategory)
      .sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name));
    return { visible: list, corrected: null };
  }, [buildings, index, category, query, favoriteIds]);

  return (
    <div className="side-section">
      <input
        className="side-search"
        type="search"
        placeholder="Filter: name, NH, basketball, coffee…"
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
        {corrected && (
          <>
            {" "}for <strong className="side-corrected">{corrected}</strong>
          </>
        )}
      </p>

      <ul className="dir-list">
        {visible.map((b) => {
          const fav = favoriteIds.has(b.id);
          const current = selected?.id === b.id;
          return (
            <li key={b.id} className={`place-card cat-${b.category}`} aria-current={current ? "true" : undefined}>
              <CardPhoto load={buildingPhotoLoader(b)} fallbackLabel={badgeFor(b)}>
                <button
                  type="button"
                  className="card-photo-hit"
                  aria-label={`Show ${b.name} on the map`}
                  onClick={() => onSelect(b)}
                />
                <span className="card-caption">
                  <span className="card-eyebrow">
                    {badgeFor(b)} · {categoryShort(b.category)}
                  </span>
                  <span className="card-title">{b.name}</span>
                </span>
                <button
                  type="button"
                  className={`star-toggle card-star${fav ? " is-on" : ""}`}
                  aria-pressed={fav}
                  aria-label={fav ? `Remove ${b.name} from saved places` : `Save ${b.name}`}
                  title={fav ? "Saved" : "Save"}
                  onClick={() => onToggleFavorite(b.id)}
                >
                  {fav ? "★" : "☆"}
                </button>
              </CardPhoto>
              <div className="place-card-body">
                {(b.description || b.note) && <p className="place-desc">{b.description || b.note}</p>}
                {b.address && (
                  <p className="place-meta">
                    <span>{b.address}</span>
                  </p>
                )}
                <div className="place-actions">
                  <button type="button" className="cal-btn" onClick={() => onSelect(b)}>
                    Show on map
                  </button>
                  <a className="cal-btn ghost" href={googleMapsUrl(b)} target="_blank" rel="noreferrer">
                    Walk here
                  </a>
                </div>
              </div>
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
