// Display names for building categories in data/buildings.json.
const LABELS = {
  academic: "Academic",
  student_life: "Student life",
  athletics: "Athletics & rec",
  admin: "Administration",
  housing: "Housing",
  parking: "Parking",
  dining: "Dining",
};

// Badge text for places without a MyMav abbreviation (garages, cafes, apartments).
const BADGES = { parking: "P", dining: "Eat", housing: "Live" };

export function badgeFor(building) {
  return (building.abbr || [])[0] || BADGES[building.category] || building.id.toUpperCase().slice(0, 4);
}

// Marker colors on the map (match the .cat-* colors in index.css).
export const CATEGORY_COLORS = {
  academic: "#6ea6ff",
  student_life: "#f58220",
  athletics: "#3fbf8a",
  admin: "#c7a6ff",
  parking: "#9aa6b8",
  dining: "#ffb347",
  housing: "#f28cb1",
};

export function categoryLabel(category) {
  if (!category) return "Other";
  return LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
