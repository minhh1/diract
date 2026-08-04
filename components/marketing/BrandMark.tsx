// The one shared logo mark for every marketing/auth surface (nav, footer,
// login panel) -- previously duplicated inline in the landing page's nav/
// footer and, on the login page, a completely different black-square
// Fingerprint icon. One mark now, one place to change it.
export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="14" width="110" height="110" rx="24" fill="#818cf8" fillOpacity="0.4" />
      <rect x="14" y="0" width="110" height="110" rx="24" fill="#4f46e5" />
    </svg>
  );
}
