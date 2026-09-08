/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#F4F8FC",
      "foreground": "#07223B",
      "border": "#C4D9E8",
      "card": "#FFFFFF",
      "cardForeground": "#07223B",
      "popover": "#FFFFFF",
      "popoverForeground": "#07223B",
      "primary": "#078FEA",
      "primaryForeground": "#FFFFFF",
      "secondary": "#D6EAF7",
      "secondaryForeground": "#0A3152",
      "muted": "#E9F3FA",
      "mutedForeground": "#4B6A82",
      "accent": "#B6DEFA",
      "accentForeground": "#0A3152",
      "destructive": "#C84E62",
      "destructiveForeground": "#FFFFFF",
      "input": "#C4D9E8",
      "ring": "#078FEA",
      "chart1": "#078FEA",
      "chart2": "#2A6FB0",
      "chart3": "#50A7DB",
      "chart4": "#7CC8F0",
      "chart5": "#174A75",
      "sidebar": "#E9F3FA",
      "sidebarForeground": "#0A3152",
      "sidebarBorder": "#C4D9E8",
      "sidebarPrimary": "#078FEA",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#D6EAF7",
      "sidebarAccentForeground": "#0A3152",
      "sidebarRing": "#078FEA"
    },
    "dark": {
      "background": "#03111F",
      "foreground": "#F3F8FC",
      "border": "#1B3E5C",
      "card": "#0A2035",
      "cardForeground": "#F3F8FC",
      "popover": "#0B2944",
      "popoverForeground": "#F3F8FC",
      "primary": "#2DA8FF",
      "primaryForeground": "#03111F",
      "secondary": "#0E3A5F",
      "secondaryForeground": "#E7F4FF",
      "muted": "#0B2A46",
      "mutedForeground": "#9BB6CB",
      "accent": "#164E7A",
      "accentForeground": "#EFF8FF",
      "destructive": "#DB6574",
      "destructiveForeground": "#FFFFFF",
      "input": "#1B3E5C",
      "ring": "#63BFFF",
      "chart1": "#2DA8FF",
      "chart2": "#63BFFF",
      "chart3": "#2A6FB0",
      "chart4": "#7CC8F0",
      "chart5": "#174A75",
      "sidebar": "#061928",
      "sidebarForeground": "#D3E4F0",
      "sidebarBorder": "#163A57",
      "sidebarPrimary": "#2DA8FF",
      "sidebarPrimaryForeground": "#03111F",
      "sidebarAccent": "#0C3150",
      "sidebarAccentForeground": "#F3F8FC",
      "sidebarRing": "#63BFFF"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "Geist Mono",
      "monospace"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
