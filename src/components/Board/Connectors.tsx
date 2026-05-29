"use client";

import { useEffect, useState } from "react";

export function Connectors({
  pairs, cardEls, containerEl,
}: {
  pairs: [string, string][];
  cardEls: React.MutableRefObject<Record<string, HTMLDivElement>>;
  containerEl: HTMLDivElement | null;
}) {
  const [, forceRedraw] = useState(0);
  useEffect(() => {
    const handler = () => forceRedraw((n) => n + 1);
    window.addEventListener("resize", handler);
    const obs = new ResizeObserver(handler);
    if (containerEl) obs.observe(containerEl);
    const scrollEl = containerEl?.querySelector(".board-scroll") as HTMLElement | null;
    scrollEl?.addEventListener("scroll", handler);
    const actionsBody = containerEl?.querySelector(".actions-body") as HTMLElement | null;
    actionsBody?.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("resize", handler);
      obs.disconnect();
      scrollEl?.removeEventListener("scroll", handler);
      actionsBody?.removeEventListener("scroll", handler);
    };
  }, [containerEl]);

  if (!containerEl) return null;
  const cBox = containerEl.getBoundingClientRect();
  const segs = pairs
    .map(([aId, bId]) => {
      const aEl = cardEls.current[aId];
      const bEl = cardEls.current[bId];
      if (!aEl || !bEl) return null;
      const aBox = aEl.getBoundingClientRect();
      const bBox = bEl.getBoundingClientRect();
      const ax = (aBox.right > bBox.right ? aBox.left : aBox.right) - cBox.left;
      const ay = aBox.top + aBox.height / 2 - cBox.top;
      const bx = (bBox.right > aBox.right ? bBox.left : bBox.right) - cBox.left;
      const by = bBox.top + bBox.height / 2 - cBox.top;
      const dx = bx - ax;
      return {
        ax, ay, bx, by,
        c1x: ax + dx * 0.4, c1y: ay,
        c2x: bx - dx * 0.4, c2y: by,
        key: `${aId}-${bId}`,
      };
    })
    .filter(Boolean) as Array<{ax:number;ay:number;bx:number;by:number;c1x:number;c1y:number;c2x:number;c2y:number;key:string}>;

  return (
    <div className="connector-layer">
      <svg>
        {segs.map((s) => (
          <g key={s.key}>
            <path className="connector-line"
                  d={`M ${s.ax} ${s.ay} C ${s.c1x} ${s.c1y} ${s.c2x} ${s.c2y} ${s.bx} ${s.by}`} />
            <circle className="connector-dot" cx={s.ax} cy={s.ay} r="3" />
            <circle className="connector-dot" cx={s.bx} cy={s.by} r="3" />
          </g>
        ))}
      </svg>
    </div>
  );
}
