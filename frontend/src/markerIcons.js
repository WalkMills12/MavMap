/** Pin colors by building category — change these to restyle groups. */
export const CATEGORY_COLORS = {
  academic: "#F5C518", // yellow — college / academic buildings
  student_life: "#4FC3F7", // light blue
  athletics: "#F58220", // UTA orange
  admin: "#B39DDB", // soft purple
  dining: "#FFB74D", // amber
  housing: "#43A047", // green — dorms / residence halls
  parking: "#3D8BFF", // parking-sign blue — garages and lots
  campus: "#8FB3A8", // sage — other UTA buildings (use not confirmed)
  default: "#F58220",
};

function svgPin(fill) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path fill="${fill}" stroke="#0B1F3A" stroke-width="1.5"
        d="M14 1.5c-6.2 0-11.2 5-11.2 11.2 0 8.4 11.2 25.3 11.2 25.3S25.2 21.1 25.2 12.7C25.2 6.5 20.2 1.5 14 1.5z"/>
      <circle cx="14" cy="12.5" r="4.4" fill="#FFFFFF"/>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const iconCache = new Map();

// Every map pin is MavMap blue (outline colors still show the building type).
const PIN_COLOR = "#1A73E8";

export function markerIconForCategory(category, selected = false) {
  const color = PIN_COLOR;
  const key = `${color}:${selected ? 1 : 0}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const icon = {
    url: svgPin(color),
    scaledSize: selected
      ? { width: 34, height: 48 }
      : { width: 26, height: 37 },
    anchor: selected ? { x: 17, y: 48 } : { x: 13, y: 37 },
  };
  iconCache.set(key, icon);
  return icon;
}

/** Fill / stroke styles for building footprint polygons. */
// emphasis: "focus" (this type is picked in the Directory), "dim" (another type is picked) or undefined.
export function footprintStyle(category, selected = false, bakedColor, emphasis) {
  const color =
    bakedColor || CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
  const focus = emphasis === "focus";
  const dim = emphasis === "dim";
  return {
    fillColor: color,
    fillOpacity: selected ? 0.55 : focus ? 0.5 : dim ? 0.1 : 0.32,
    strokeColor: selected ? "#FFFFFF" : color,
    strokeOpacity: selected ? 1 : dim ? 0.35 : 0.95,
    strokeWeight: selected ? 3 : focus ? 3 : 2,
    zIndex: selected ? 10 : focus ? 5 : 1,
  };
}
