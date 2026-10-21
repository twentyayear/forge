// LOOK A (SCOREBOARD). THE ONLY FILE ALLOWED TO HOLD A COLOUR LITERAL; src/theme.test.js PINS THAT.
// energyDeep IS #145F86, NOT THE BOARD'S #1B7FB2, SO WHITE TEXT ON IT PASSES 4.5:1.
export const T = {
  color: {
    bg: "#0A0A0B",
    surface: "#141416",
    surface2: "#1B1B1F",
    line: "#26262B",
    lineStrong: "#3B3B44",
    text: "#F4F4F6",
    body: "#C9C9CF",
    muted: "#8C8C95",
    energy: "#29ABE2",
    energyDeep: "#145F86",
    recovery: "#7ACBEF",
    inkOnEnergy: "#081C28",
    onDeep: "#FFFFFF",
    warn: "#f0b06a",
    warnBg: "#2a1f12",
    good: "#7fe0a8",
    goodBg: "#12301f",
    scrim: "rgba(0,0,0,.65)",
    energyWash: "rgba(41,171,226,.10)",
    medalHi: "#7ACBEF",
    medalMid: "#1B7FB2",
    medalLo: "#0b4b6e",
    medalHalo: "#0f2e3f",
  },
  font: {
    display: "'Barlow Condensed', 'Barlow', system-ui, sans-serif",
    body: "'Barlow', system-ui, sans-serif",
  },
  radius: { chip: 6, control: 10, card: 12 },
  space: [0, 4, 8, 12, 16, 20, 24, 32, 40],
  type: { display: 30, numeral: 44, h: 20, body: 15, small: 13, label: 12 },
};

// index.html HARDCODES THIS SAME URL (NO JS RUNS BEFORE FIRST PAINT); THE TEST PINS THE TWO EQUAL.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap";
