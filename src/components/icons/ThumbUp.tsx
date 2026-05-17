export function ThumbUp({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 22V11" />
      <path d="M7 11l3.4-7a2.6 2.6 0 0 1 2.6 2.6V10h5.3a2 2 0 0 1 2 2.4l-1.5 7.6A2 2 0 0 1 16.8 22H7" />
    </svg>
  );
}
