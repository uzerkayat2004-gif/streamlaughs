export const SMILE_PATH = 'M6 22Q32 45 58 22';
export function SmileLogo({
  size = 32,
  className = '',
  color = 'currentColor',
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`smile-logo ${className}`}
      aria-hidden="true"
    >
      <path
        d={SMILE_PATH}
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
