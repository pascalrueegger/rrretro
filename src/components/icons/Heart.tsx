export function Heart({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-6.7-4.1-8.7-9C1.7 7.6 4.6 4.6 7.6 5.3c1.7.4 2.9 1.6 4.4 3.3 1.5-1.7 2.7-2.9 4.4-3.3 3-.7 5.9 2.3 4.3 6.2-2 4.9-8.7 9-8.7 9z" />
    </svg>
  );
}
