// Display names for building categories in data/buildings.json.
const LABELS = {
  academic: "Academic",
  student_life: "Student life",
  athletics: "Athletics & rec",
  admin: "Administration",
  housing: "Housing",
  parking: "Parking",
  dining: "Dining",
  campus: "Other campus buildings",
};

// Badge text for places without a MyMav abbreviation (garages, cafes, apartments).
const BADGES = { parking: "P", dining: "Eat", housing: "Live" };

export function badgeFor(building) {
  return (building.abbr || [])[0] || BADGES[building.category] || building.id.toUpperCase().slice(0, 4);
}

// One palette for pins, building outlines and directory chips (defined in markerIcons.js;
// the .cat-* colors in index.css match it).
export { CATEGORY_COLORS } from "./markerIcons.js";

export function categoryLabel(category) {
  if (!category) return "Other";
  return LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
