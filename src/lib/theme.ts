"use client";

import type { Tweaks } from "./types";

const LIGHT_THEME: Record<string, string> = {
  "--bg": "#f7f6f3",
  "--surface": "#ffffff",
  "--surface-2": "#fbfaf7",
  "--fg": "#18170f",
  "--fg-2": "#4a4a45",
  "--muted": "#8a8980",
  "--border": "#e7e4dc",
  "--border-strong": "#d4d0c4",
  "--accent": "#18170f",
  "--accent-soft": "rgba(24, 23, 15, 0.06)",
  "--link": "oklch(0.62 0.13 60)",
  "--link-soft": "oklch(0.62 0.13 60 / 0.14)",
  "--shadow-card": "0 1px 0 rgba(0,0,0,0.02), 0 1px 3px rgba(20,20,12,0.04)",
  "--shadow-lift": "0 10px 40px rgba(20,20,12,0.10), 0 2px 8px rgba(20,20,12,0.06)",
};

const DARK_THEME: Record<string, string> = {
  "--bg": "#0f0f0e",
  "--surface": "#181816",
  "--surface-2": "#13130f",
  "--fg": "#f5f3ec",
  "--fg-2": "#b8b5ad",
  "--muted": "#74726a",
  "--border": "#26251f",
  "--border-strong": "#3a392f",
  "--accent": "#f5f3ec",
  "--accent-soft": "rgba(245, 243, 236, 0.07)",
  "--link": "oklch(0.72 0.13 65)",
  "--link-soft": "oklch(0.72 0.13 65 / 0.18)",
  "--shadow-card": "0 1px 0 rgba(255,255,255,0.02), 0 1px 3px rgba(0,0,0,0.4)",
  "--shadow-lift": "0 10px 40px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.40)",
};

function randomTheme(): Record<string, string> {
  const hue = Math.floor(Math.random() * 360);
  const accH = (hue + 30 + Math.random() * 60) % 360;
  const dark = Math.random() > 0.5;
  const chroma = 0.012 + Math.random() * 0.014;

  if (dark) {
    return {
      "--bg": `oklch(0.16 ${chroma} ${hue})`,
      "--surface": `oklch(0.21 ${chroma} ${hue})`,
      "--surface-2": `oklch(0.18 ${chroma} ${hue})`,
      "--fg": `oklch(0.96 ${chroma * 0.4} ${hue})`,
      "--fg-2": `oklch(0.78 ${chroma * 0.6} ${hue})`,
      "--muted": `oklch(0.55 ${chroma * 0.7} ${hue})`,
      "--border": `oklch(0.28 ${chroma} ${hue})`,
      "--border-strong": `oklch(0.38 ${chroma * 1.4} ${hue})`,
      "--accent": `oklch(0.96 ${chroma * 0.4} ${hue})`,
      "--accent-soft": `oklch(0.96 ${chroma * 0.4} ${hue} / 0.08)`,
      "--link": `oklch(0.74 0.14 ${accH})`,
      "--link-soft": `oklch(0.74 0.14 ${accH} / 0.20)`,
      "--shadow-card": "0 1px 0 rgba(255,255,255,0.02), 0 1px 3px rgba(0,0,0,0.4)",
      "--shadow-lift": "0 10px 40px rgba(0,0,0,0.50), 0 2px 8px rgba(0,0,0,0.40)",
    };
  }
  return {
    "--bg": `oklch(0.97 ${chroma} ${hue})`,
    "--surface": `oklch(0.995 ${chroma * 0.5} ${hue})`,
    "--surface-2": `oklch(0.985 ${chroma * 0.7} ${hue})`,
    "--fg": `oklch(0.20 ${chroma} ${hue})`,
    "--fg-2": `oklch(0.40 ${chroma} ${hue})`,
    "--muted": `oklch(0.60 ${chroma * 0.7} ${hue})`,
    "--border": `oklch(0.90 ${chroma} ${hue})`,
    "--border-strong": `oklch(0.82 ${chroma * 1.2} ${hue})`,
    "--accent": `oklch(0.20 ${chroma} ${hue})`,
    "--accent-soft": `oklch(0.20 ${chroma} ${hue} / 0.06)`,
    "--link": `oklch(0.58 0.14 ${accH})`,
    "--link-soft": `oklch(0.58 0.14 ${accH} / 0.14)`,
    "--shadow-card": "0 1px 0 rgba(0,0,0,0.02), 0 1px 3px rgba(20,20,12,0.04)",
    "--shadow-lift": "0 10px 40px rgba(20,20,12,0.10), 0 2px 8px rgba(20,20,12,0.06)",
  };
}

let randomCache: Record<string, string> | null = null;

export function applyTheme(theme: Tweaks["theme"], flavor: Tweaks["flavor"], density: Tweaks["density"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  let tokens: Record<string, string>;
  if (theme === "dark") tokens = DARK_THEME;
  else if (theme === "random") {
    if (!randomCache) randomCache = randomTheme();
    tokens = randomCache;
  } else tokens = LIGHT_THEME;

  Object.entries(tokens).forEach(([k, v]) => {
    if (k.startsWith("--")) root.style.setProperty(k, v);
  });
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-flavor", flavor || "swiss");
  root.setAttribute("data-density", density || "regular");
}

export function rerollRandom() {
  randomCache = null;
}

export function nameColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `oklch(0.62 0.12 ${h})`;
}
