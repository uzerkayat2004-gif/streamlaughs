/** One geometry for toolbar PNGs, website, overlays and canvas share cards. */
export const EYES_PATH = 'M15 25Q21 17 27 25M37 25Q43 17 49 25';
export const MOUTH_PATH = 'M14 34H50C49 56 15 56 14 34Z';
export function AppIcon({
  size = 40,
  mono = false,
  className = '',
}: {
  size?: number;
  mono?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`app-face ${className}`}
    >
      {!mono && <rect width="64" height="64" rx="18" fill="#FFD23F" />}
      <g
        fill={mono ? 'currentColor' : '#14141A'}
        stroke={mono ? 'currentColor' : '#14141A'}
      >
        <path
          className="face-eyes"
          d={EYES_PATH}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path className="face-mouth" d={MOUTH_PATH} stroke="none" />
      </g>
    </svg>
  );
}
