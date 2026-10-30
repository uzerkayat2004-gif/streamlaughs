import { PRODUCT, type Recap } from '@laughline/shared';
import { useEffect, useState } from 'react';
import { Sheet } from './components';
import type { StreamerProfile } from './history';
import { renderShareCard, shareText } from './share-card';
export function ShareSheet({
  recap,
  profile,
  close,
}: {
  recap: Recap;
  profile?: StreamerProfile;
  close: () => void;
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string }>(),
    [message, setMessage] = useState('drawing your little story…');
  useEffect(() => {
    let alive = true,
      url: string | undefined;
    void renderShareCard(recap, profile)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
        setMessage('stats only · no audio or recordings');
      })
      .catch(() => {
        if (alive)
          setMessage('couldn’t draw the image · copy the text instead');
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recap, profile]);
  const filename = `${PRODUCT.wordmark}-${recap.channel}-${new Date(recap.createdAt).toISOString().slice(0, 10)}.png`;
  const file = image
    ? new File([image.blob], filename, { type: 'image/png' })
    : undefined;
  const canShare =
    !!file &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });
  return (
    <Sheet title="share your story" close={close}>
      <div className="share-sheet-content">
        {image && (
          <img
            src={image.url}
            width="1080"
            height="1920"
            alt="your share card preview"
            className="share-preview"
          />
        )}
        <p role="status" className="sub">
          {message}
        </p>
        <div className="share-actions">
          {image && (
            <a className="btn" href={image.url} download={filename}>
              download image
            </a>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!image || typeof ClipboardItem === 'undefined'}
            onClick={async () => {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': image!.blob }),
                ]);
                setMessage('image copied');
              } catch {
                setMessage('couldn’t copy · download the image instead');
              }
            }}
          >
            copy image
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!canShare}
            title={
              canShare
                ? 'share the PNG'
                : 'use download or copy in this browser'
            }
            onClick={async () => {
              try {
                await navigator.share({ files: [file!], title: PRODUCT.name });
                setMessage('shared');
              } catch {
                setMessage('share cancelled · try again');
              }
            }}
          >
            share
          </button>
          <button
            type="button"
            className="textbtn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareText(recap, profile));
                setMessage('text copied');
              } catch {
                setMessage('couldn’t copy · download the image instead');
              }
            }}
          >
            copy text
          </button>
        </div>
      </div>
    </Sheet>
  );
}
