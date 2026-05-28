export const uid = (p = "id") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    // strip dashes, keep first 12 chars — plenty for client-only ids
    return `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  // fallback for non-secure contexts / older runtimes
  return `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
};

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const randCode = () => {
  const len = 6;
  // Unbiased pick using crypto.getRandomValues when available; rejection-sample.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const out: string[] = [];
    const max = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
    const buf = new Uint8Array(len * 2); // overprovision for rejection
    while (out.length < len) {
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length && out.length < len; i++) {
        const b = buf[i];
        if (b < max) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      }
    }
    return out.join("");
  }
  return Array.from({ length: len },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join("");
};

export const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join("");

export function formatDue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const label = d.toLocaleDateString(undefined, opts);
  if (diff === 0) return `${label} · today`;
  if (diff === 1) return `${label} · tomorrow`;
  if (diff === -1) return `${label} · yesterday`;
  if (diff > 1 && diff < 8) return `${label} · in ${diff}d`;
  if (diff < 0) return `${label} · overdue`;
  return label;
}
