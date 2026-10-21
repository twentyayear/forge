export const DAY_MS = 86400000;
export const WD = ["S", "M", "T", "W", "T", "F", "S"];
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const pad2 = (n) => String(n).padStart(2, "0");
// LOCAL CALENDAR DAY, NOT toISOString: A UTC KEY WOULD SHIFT THE DAY FOR EVENING USERS WEST OF GREENWICH.
export const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const fmtLong = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
export const fmtMonth = (d) => `${d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()} '${String(d.getFullYear()).slice(2)}`;
