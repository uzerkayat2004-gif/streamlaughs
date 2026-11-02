'use client';
import { useEffect } from 'react';

// Pointer-driven only: no idle render loop or layout work while the tab is hidden.
export function SiteMotion() {
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const reset = () => {
      document.documentElement.dataset.motionPaused = String(
        document.hidden || reduce.matches,
      );
      if (document.hidden || reduce.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        for (const svg of document.querySelectorAll<SVGElement>(
          '.smile-svg, .app-face',
        )) {
          svg.style.setProperty('--eye-x', '0px');
          svg.style.setProperty('--eye-y', '0px');
        }
      }
    };
    const move = (event: PointerEvent) => {
      if (frame || document.hidden || reduce.matches) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const svg of document.querySelectorAll<SVGElement>(
          '.smile-svg, .app-face',
        )) {
          const r = svg.getBoundingClientRect();
          if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
          const scale = svg.classList.contains('app-face') ? 1.5 : 7;
          svg.style.setProperty(
            '--eye-x',
            `${Math.max(-scale, Math.min(scale, ((event.clientX - r.left - r.width / 2) / innerWidth) * scale * 2))}px`,
          );
          svg.style.setProperty(
            '--eye-y',
            `${Math.max(-scale, Math.min(scale, ((event.clientY - r.top - r.height / 2) / innerHeight) * scale * 2))}px`,
          );
        }
      });
    };
    reset();
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('visibilitychange', reset);
    reduce.addEventListener('change', reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', reset);
      reduce.removeEventListener('change', reset);
    };
  }, []);
  return null;
}
