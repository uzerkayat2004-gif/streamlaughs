'use client';
import { PRODUCT } from '@laughline/shared';
import { useEffect, useRef } from 'react';
import { Arrow } from './brand';

export function InstallDownload({ automatic }: { automatic: boolean }) {
  const started = useRef(false);
  useEffect(() => {
    if (!automatic || started.current) return;
    started.current = true;
    const link = document.createElement('a');
    link.href = '/download';
    link.download = '';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }, [automatic]);

  return automatic ? (
    <div className="download-started">
      <p role="status">your download started</p>
      <a className="text-link" href="/download" download>
        didn’t start? download again <Arrow />
      </a>
    </div>
  ) : (
    <a className="button yellow install-download" href="/download" download>
      Download {PRODUCT.name} <Arrow />
    </a>
  );
}
