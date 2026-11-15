// Display names for building categories in data/buildings.json.
const LABELS = {
  academic: "Academic",
  student_life: "Student life",
  athletics: "Athletics",
  recreation: "Recreation",
  admin: "Administration",
  housing: "Housing",
  parking: "Parking",
  dining: "Dining",
};

// Badge text for places without an official UTA code or a short name.
const BADGES = { parking: "P", dining: "Eat", housing: "Res" };

/** Official UTA building code ("NH", "PKH"), else a short name ("Park North"). */
export function badgeFor(building) {
  return (building.abbr || [])[0] || building.short || BADGES[building.category] || building.id.toUpperCase().slice(0, 4);
}

// Marker colors on the map (match the .cat-* colors in index.css).
export const CATEGORY_COLORS = {
  academic: "#6ea6ff",
  student_life: "#f58220",
  athletics: "#3fbf8a",
  recreation: "#2bb8d9",
  admin: "#c7a6ff",
  parking: "#9aa6b8",
  dining: "#ffb347",
  housing: "#f28cb1",
};

export function categoryLabel(category) {
  if (!category) return "Other";
  return LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Short category tags for search results and cards ("ATH", "REC").
const SHORT_LABELS = {
  academic: "ACAD",
  student_life: "STU LIFE",
  athletics: "ATH",
  recreation: "REC",
  admin: "ADMIN",
  housing: "HOUSING",
  parking: "PARKING",
  dining: "DINING",
};

export function categoryShort(category) {
  return SHORT_LABELS[category] ?? categoryLabel(category).toUpperCase();
}
