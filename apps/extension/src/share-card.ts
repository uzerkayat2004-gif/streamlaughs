import { isApprovedPhrase, PRODUCT, type Recap } from '@laughline/shared';
import { EYES_PATH, MOUTH_PATH } from './AppIcon';
import { avatarColor, type StreamerProfile, safeAvatar } from './history';
export const SHARE_SIZE = { width: 1080, height: 1920 };
export function shareCardData(recap: Recap, profile?: StreamerProfile) {
  const name = (
    profile?.displayName ||
    recap.displayName ||
    recap.channel
  ).slice(0, 100);
  const word = recap.topWord.trim().toLowerCase();
  return {
    name,
    channel: recap.channel,
    date: new Date(recap.startedAt ?? recap.createdAt).toLocaleDateString(
      'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' },
    ),
    laughs: recap.totalLaughs,
    word:
      recap.wordCount > 0 && word.length <= 40 && isApprovedPhrase(word)
        ? word
        : null,
    hype: recap.hype,
    gasps: recap.gasps,
    screams: recap.screams,
    bestMoment:
      recap.totalLaughs > 0 && (recap.hasBestMoment ?? recap.hardestLaughAt > 0)
        ? recap.hardestLaughAt
        : null,
    demo: recap.source === 'fake' || recap.crowdSummary?.testTraffic === true,
    avatar: safeAvatar(profile?.avatarDataUrl)
      ? profile!.avatarDataUrl
      : undefined,
    heading: 'I laughed',
    canShare: recap.totalLaughs > 0,
  };
}
export function shareText(recap: Recap, profile?: StreamerProfile) {
  const d = shareCardData(recap, profile);
  return d.laughs
    ? `I laughed ${d.laughs} times with ${d.name}.${d.word ? ` Word of the night: ${d.word}.` : ''} ${PRODUCT.siteUrl}`
    : `A good stream with ${d.name}. Some nights are just for watching. ${PRODUCT.siteUrl}`;
}
export type ShareContext = { ordinal?: string; bestMoment?: number };
const time = (n: number) =>
  `${Math.floor(n / 3600) ? `${Math.floor(n / 3600)}:` : ''}${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  width: number,
  weight = 750,
) {
  while (size > 24) {
    ctx.font = `${weight} ${size}px "LL Bricolage",sans-serif`;
    if (ctx.measureText(text).width <= width) break;
    size -= 2;
  }
}
function face(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.fillStyle = '#FFD23F';
  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, 18);
  ctx.fill();
  ctx.strokeStyle = '#14141A';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(EYES_PATH));
  ctx.fillStyle = '#14141A';
  ctx.fill(new Path2D(MOUTH_PATH));
  ctx.restore();
}
export async function renderShareCard(
  recap: Recap,
  profile?: StreamerProfile,
  context: ShareContext = {},
): Promise<Blob> {
  if (!recap.totalLaughs) throw new Error('no laughs to share · test my mic');
  await document.fonts.ready;
  const d = shareCardData(recap, profile),
    canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image unavailable');
  // The laughs story is always coral, following the yellow intro.
  ctx.fillStyle = '#FF5C5C';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#FF9898';
  ctx.beginPath();
  ctx.arc(1080, 80, 400, 0, Math.PI * 2);
  ctx.fill();
  face(ctx, 88, 90, 82);
  ctx.fillStyle = '#14141A';
  fit(ctx, PRODUCT.wordmark, 56, 730);
  ctx.fillText(PRODUCT.wordmark, 194, 146);
  // Text wordmark has only its smile underline.
  ctx.beginPath();
  ctx.moveTo(198, 168);
  ctx.quadraticCurveTo(420, 204, 644, 168);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#14141A';
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(150, 330, 62, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = avatarColor(d.channel);
  ctx.fillRect(88, 268, 124, 124);
  let avatar: HTMLImageElement | undefined;
  if (d.avatar)
    try {
      avatar = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const t = setTimeout(
          () => reject(new Error('avatar unavailable')),
          2000,
        );
        image.onload = () => {
          clearTimeout(t);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(t);
          reject(new Error('avatar unavailable'));
        };
        image.src = d.avatar!;
      });
    } catch {
      /* Initials remain available offline. */
    }
  if (avatar) ctx.drawImage(avatar, 88, 268, 124, 124);
  else {
    ctx.fillStyle = '#14141A';
    ctx.font = '750 55px "LL Bricolage",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.name[0]?.toUpperCase() || 'S', 150, 349);
  }
  ctx.restore();
  ctx.fillStyle = '#14141A';
  ctx.textAlign = 'left';
  fit(ctx, d.name, 58, 690);
  ctx.fillText(d.name, 246, 325, 690);
  ctx.font = '400 28px "LL Inter",sans-serif';
  ctx.fillText(d.date, 248, 371);
  ctx.font = '750 68px "LL Bricolage",sans-serif';
  ctx.fillText('I laughed', 88, 575);
  fit(ctx, String(d.laughs), 300, 905, 800);
  ctx.fillText(String(d.laughs), 77, 870);
  ctx.font = '650 60px "LL Bricolage",sans-serif';
  ctx.fillText('times with', 92, 968);
  fit(ctx, d.name, 88, 900);
  ctx.fillText(d.name, 88, 1074, 900);
  const chips: [string, string, string][] = [];
  if (d.word) chips.push(['word of the night', `“${d.word}”`, '#FFD23F']);
  const moment = context.bestMoment ?? d.bestMoment;
  if (moment !== null && moment !== undefined)
    chips.push(['biggest minute', time(moment), '#2EE6C5']);
  if (d.hype > 0) chips.push(['hype shouts', String(d.hype), '#FFEAA0']);
  // Missing facts are omitted, never turned into zero-filled tiles.
  for (const [i, [label, value, color]] of chips.slice(0, 3).entries()) {
    const y = 1174 + i * 122;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(88, y, 904, 104, 26);
    ctx.fill();
    ctx.fillStyle = '#14141A';
    ctx.font = '500 25px "LL Inter",sans-serif';
    ctx.fillText(label, 116, y + 37);
    fit(ctx, value, 42, 520);
    ctx.textAlign = 'right';
    ctx.fillText(value, 960, y + 67, 520);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#14141A';
  ctx.font = '500 33px "LL Inter",sans-serif';
  if (context.ordinal) {
    fit(ctx, `my ${context.ordinal} stream with ${d.name}`, 33, 900, 500);
    ctx.fillText(`my ${context.ordinal} stream with ${d.name}`, 90, 1643, 900);
  }
  if (d.demo) {
    ctx.font = '500 24px "LL Inter",sans-serif';
    ctx.fillText('demo · simulated stats', 90, 1705);
  }
  ctx.beginPath();
  ctx.moveTo(88, 1760);
  ctx.lineTo(992, 1760);
  ctx.strokeStyle = '#14141A';
  ctx.lineWidth = 2;
  ctx.stroke();
  const footer = `get your recap · ${new URL(PRODUCT.siteUrl).host}`;
  fit(ctx, footer, 31, 904, 500);
  ctx.fillText(footer, 88, 1830);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('image unavailable'))),
      'image/png',
    ),
  );
}
