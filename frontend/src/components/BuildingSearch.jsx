export default function BuildingSearch({ query, onQueryChange, results, onSelect }) {
  return (
    <div className="search-wrap">
      <input
        className="search-input"
        type="search"
        placeholder="Search NH, Library, MAC…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search buildings"
      />
      {query.trim() && (
        <ul className="search-results">
          {results.slice(0, 8).map((building) => (
            <li key={building.id}>
              <button type="button" onClick={() => onSelect(building)}>
                <span className="result-name">{building.name}</span>
                <span className="result-abbr">{(building.abbr || []).join(" · ")}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="empty">No buildings match</li>}
        </ul>
      )}
    </div>
  );
}