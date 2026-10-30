import { isApprovedPhrase, PRODUCT, type Recap } from '@laughline/shared';
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
    heading:
      recap.totalLaughs > 0
        ? 'I laughed'
        : 'a good stream.\na quiet laugh track.',
  };
}
export function shareText(recap: Recap, profile?: StreamerProfile) {
  const d = shareCardData(recap, profile);
  return d.laughs
    ? `I laughed ${d.laughs} times with ${d.name}.${d.word ? ` Word of the night: ${d.word}.` : ''} ${PRODUCT.siteUrl}`
    : `A good stream with ${d.name}. Some nights are just for watching. ${PRODUCT.siteUrl}`;
}
const time = (n: number) =>
  `${Math.floor(n / 3600) ? `${Math.floor(n / 3600)}:` : ''}${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
function smile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.beginPath();
  ctx.moveTo(6, 22);
  ctx.quadraticCurveTo(32, 45, 58, 22);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  width: number,
  weight = 750,
) {
  while (size > 24) {
    ctx.font = `${weight} ${size}px "LL Bricolage", sans-serif`;
    if (ctx.measureText(text).width <= width) break;
    size -= 2;
  }
  return text;
}
export async function renderShareCard(
  recap: Recap,
  profile?: StreamerProfile,
): Promise<Blob> {
  await document.fonts.ready;
  const data = shareCardData(recap, profile),
    canvas = document.createElement('canvas');
  canvas.width = SHARE_SIZE.width;
  canvas.height = SHARE_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image unavailable');
  ctx.fillStyle = '#0E0E12';
  ctx.fillRect(0, 0, 1080, 1920);
  const glow = ctx.createRadialGradient(850, 400, 10, 850, 400, 800);
  glow.addColorStop(0, '#FFD23F10');
  glow.addColorStop(1, '#FFD23F00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.strokeStyle = '#ffffff1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(44, 44, 992, 1832, 44);
  ctx.stroke();
  smile(ctx, 92, 100, 86, '#FFD23F');
  ctx.fillStyle = '#f4f4f7';
  fit(ctx, PRODUCT.wordmark, 58, 740);
  ctx.fillText(PRODUCT.wordmark, 194, 150);
  const centerX = 154,
    centerY = 327;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 62, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = avatarColor(data.channel);
  ctx.fillRect(centerX - 62, centerY - 62, 124, 124);
  let avatar: HTMLImageElement | undefined;
  if (data.avatar) {
    try {
      avatar = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timeout = setTimeout(
          () => reject(new Error('avatar unavailable')),
          2000,
        );
        image.onload = () => {
          clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('avatar unavailable'));
        };
        image.src = data.avatar!;
      });
    } catch {
      /* The initials are always ready, even offline. */
    }
  }
  if (avatar) ctx.drawImage(avatar, centerX - 62, centerY - 62, 124, 124);
  else {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 55px "LL Bricolage",sans-serif';
    ctx.fillText(data.name[0]?.toUpperCase() || 'S', centerX, centerY + 19);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f4f7';
  fit(ctx, data.name, 58, 700);
  ctx.fillText(data.name, 245, 320, 700);
  ctx.font = '400 30px "LL Inter",sans-serif';
  ctx.fillStyle = '#a6a6b0';
  ctx.fillText(data.date, 247, 366);
  if (data.laughs) {
    ctx.fillStyle = '#e6e6eb';
    ctx.font = '600 61px "LL Bricolage",sans-serif';
    ctx.fillText(data.heading, 92, 550);
    ctx.fillStyle = '#FFD23F';
    fit(ctx, String(data.laughs), 268, 890, 800);
    ctx.fillText(String(data.laughs), 82, 811);
    ctx.fillStyle = '#e6e6eb';
    ctx.font = '600 58px "LL Bricolage",sans-serif';
    ctx.fillText('times with', 94, 902);
    fit(ctx, data.name, 78, 890);
    ctx.fillText(data.name, 92, 998, 890);
  } else {
    ctx.fillStyle = '#f4f4f7';
    ctx.font = '750 88px "LL Bricolage",sans-serif';
    const [first, second] = data.heading.split('\n');
    ctx.fillText(first!, 92, 605);
    ctx.fillText(second!, 92, 711);
    ctx.fillStyle = '#a6a6b0';
    ctx.font = '400 34px "LL Inter",sans-serif';
    ctx.fillText('some nights are just for watching.', 94, 798);
  }
  ctx.fillStyle = '#ffffff08';
  ctx.beginPath();
  ctx.roundRect(92, 1115, 896, 205, 26);
  ctx.fill();
  ctx.strokeStyle = '#ffffff12';
  ctx.stroke();
  ctx.fillStyle = '#a6a6b0';
  ctx.font = '500 25px "LL Inter",sans-serif';
  ctx.fillText('word of the night', 124, 1174);
  ctx.fillStyle = data.word ? '#FFD23F' : '#e4e4e9';
  fit(ctx, data.word ? `“${data.word}”` : 'all laughs. no words yet.', 66, 830);
  ctx.fillText(
    data.word ? `“${data.word}”` : 'all laughs. no words yet.',
    124,
    1265,
  );
  for (const [index, [label, value]] of [
    ['hype shouts', data.hype],
    ['gasps', data.gasps],
    ['screams', data.screams],
  ].entries()) {
    const x = 92 + index * 307;
    ctx.fillStyle = '#ffffff07';
    ctx.beginPath();
    ctx.roundRect(x, 1372, 282, 156, 22);
    ctx.fill();
    ctx.fillStyle = '#e4e4e9';
    ctx.font = '750 58px "LL Bricolage",sans-serif';
    ctx.fillText(String(value), x + 26, 1445);
    ctx.fillStyle = '#a6a6b0';
    ctx.font = '400 24px "LL Inter",sans-serif';
    ctx.fillText(String(label), x + 26, 1488);
  }
  ctx.fillStyle = '#b3b3bd';
  ctx.font = '400 28px "LL Inter",sans-serif';
  if (data.bestMoment !== null)
    ctx.fillText(`best moment · ${time(data.bestMoment)}`, 94, 1617);
  else ctx.fillText('your next laugh is one stream away.', 94, 1617);
  ctx.strokeStyle = '#ffffff16';
  ctx.beginPath();
  ctx.moveTo(92, 1740);
  ctx.lineTo(988, 1740);
  ctx.stroke();
  smile(ctx, 92, 1784, 63, '#FFD23F');
  ctx.fillStyle = '#b3b3bd';
  ctx.font = '500 30px "LL Inter",sans-serif';
  ctx.fillText(new URL(PRODUCT.siteUrl).host, 178, 1821);
  if (data.demo) {
    ctx.fillStyle = '#9999a8';
    ctx.font = '400 22px "LL Inter",sans-serif';
    ctx.fillText('demo · simulated stats', 94, 1685);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image unavailable'))),
      'image/png',
    ),
  );
}
