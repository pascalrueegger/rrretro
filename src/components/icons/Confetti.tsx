export function Confetti({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.4 20.6l4.7-12.2 7.5 7.5L3.4 20.6z" />
      <path d="M9 10.5l5 5" />
      <path d="M14.5 5l1.2 1.2" />
      <path d="M18.5 4l-.6 1.8" />
      <path d="M20 8l1.6.6" />
      <path d="M17 10.5l1.5-.4" />
      <path d="M13 3l.6 1.5" />
    </svg>
  );
}
