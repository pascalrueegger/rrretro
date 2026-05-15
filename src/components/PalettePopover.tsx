"use client";

import { useEffect, useRef, useState } from "react";
import type { Tweaks } from "@/lib/types";

interface Props {
  theme: Tweaks["theme"];
  flavor: Tweaks["flavor"];
  density: Tweaks["density"];
  onTheme: (v: Tweaks["theme"]) => void;
  onFlavor: (v: Tweaks["flavor"]) => void;
  onDensity: (v: Tweaks["density"]) => void;
  onReroll: () => void;
}

const THEMES: { k: Tweaks["theme"]; l: string; cls: string; s: string }[] = [
  { k: "light", l: "Light", cls: "light", s: "Aa" },
  { k: "dark", l: "Dark", cls: "dark", s: "Aa" },
  { k: "random", l: "Random", cls: "random", s: "??" },
];
const FLAVORS: { k: Tweaks["flavor"]; l: string }[] = [
  { k: "swiss", l: "Swiss" },
  { k: "editorial", l: "Editorial" },
  { k: "mono", l: "Mono" },
  { k: "hand", l: "Hand" },
];
const DENSITIES: { k: Tweaks["density"]; l: string; rows: number[]; h: number }[] = [
  { k: "compact", l: "Compact", rows: [3, 8, 13], h: 3 },
  { k: "regular", l: "Regular", rows: [2, 9, 16], h: 3 },
  { k: "comfy", l: "Comfy", rows: [2, 11, 20], h: 3 },
];

export default function PalettePopover({
  theme, flavor, density, onTheme, onFlavor, onDensity, onReroll,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="palette-wrap" ref={wrapRef}>
      <button type="button"
              className={`palette-trigger ${open ? "open" : ""}`}
              title="Appearance"
              onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-1.4 3.4l.4.4A2 2 0 0 1 12 22Z" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" />
          <circle cx="10.5" cy="7" r="1" fill="currentColor" />
          <circle cx="15.5" cy="7" r="1" fill="currentColor" />
          <circle cx="18" cy="11" r="1" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="palette-pop" role="dialog" aria-label="Appearance">
          <div className="pp-section">Theme</div>
          <div className="pp-grid theme">
            {THEMES.map((o) => (
              <button key={o.k} type="button"
                      className={`pp-opt ${theme === o.k ? "active" : ""}`}
                      onClick={() => { if (o.k === "random") onReroll(); onTheme(o.k); }}>
                <span className={`pp-theme-swatch ${o.cls}`}>{o.s}</span>
                <span className="lbl">{o.l}</span>
              </button>
            ))}
          </div>
          {theme === "random" && (
            <button type="button" className="pp-reroll" onClick={onReroll}>
              <span>↻</span> Reroll palette
            </button>
          )}
          <div className="pp-section">Type</div>
          <div className="pp-grid flavor">
            {FLAVORS.map((o) => (
              <button key={o.k} type="button"
                      className={`pp-opt ${flavor === o.k ? "active" : ""}`}
                      onClick={() => onFlavor(o.k)}>
                <span className={`pp-flavor-sample ${o.k}`}>Retro</span>
                <span className="lbl">{o.l}</span>
              </button>
            ))}
          </div>

          <div className="pp-section">Density</div>
          <div className="pp-grid theme">
            {DENSITIES.map((o) => (
              <button key={o.k} type="button"
                      className={`pp-opt ${density === o.k ? "active" : ""}`}
                      onClick={() => onDensity(o.k)}>
                <span className="pp-density-glyph">
                  <svg width="28" height="26" viewBox="0 0 28 26" fill="none"
                       stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                    {o.rows.map((y, i) => (
                      <rect key={i} x="4" y={y} width="20" height={o.h} rx="1.4" />
                    ))}
                  </svg>
                </span>
                <span className="lbl">{o.l}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
