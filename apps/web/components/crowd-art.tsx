export function CrowdArt({
  children,
  illustration = false,
  calm = false,
}: {
  children?: React.ReactNode;
  illustration?: boolean;
  calm?: boolean;
}) {
  return (
    <div className={`crowd-art ${calm ? 'is-calm' : ''}`}>
      <div className="crowd-halo" />
      <div className="crowd-orbit" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="crowd-blob">
        <div className="blob-center">
          {children ?? (
            <svg className="happy-face" viewBox="0 0 100 85" aria-hidden="true">
              <path d="M20 25v8m60-8v8M20 52q30 34 60 0" />
            </svg>
          )}
        </div>
      </div>
      {illustration && (
        <>
          <span className="floating-word word-a">
            no way<span>↗</span>
          </span>
          <span className="floating-word word-b">LMAO</span>
          <span className="floating-word word-c">
            brooo<span>✦</span>
          </span>
          <span className="floating-spark">✳</span>
        </>
      )}
    </div>
  );
}
