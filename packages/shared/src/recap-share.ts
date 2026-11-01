import { z } from 'zod';
import { isCrowdPhrase } from './crowd';
const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^(0|[1-9]\d*)$/)
    .max(8)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
const label = z.string().max(40).refine(isCrowdPhrase);
const schema = z
  .object({
    streamer: z.string().regex(/^[a-z0-9_]{1,25}$/),
    date: z
      .string()
      .regex(/^20\d\d-\d\d-\d\d$/)
      .refine((s) => {
        const d = new Date(`${s}T12:00:00Z`);
        return (
          Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
        );
      }),
    laughs: integer(1, 1000000),
    minutes: integer(0, 10080).optional(),
    word: label.optional(),
    funniest: label.optional(),
    moment: integer(0, 604800).optional(),
    hype: integer(1, 1000000).optional(),
    stream: integer(1, 100000),
    replay: z.literal('1').optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.replay === '1' ||
      d.moment === undefined ||
      d.minutes === undefined ||
      d.moment < (d.minutes + 1) * 60,
  );
export type RecapShare = z.infer<typeof schema>;
/** No free text, viewer identity, URLs, images, HTML, tokens or unknown keys. */
export function parseRecapShare(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): RecapShare | null {
  const params =
    input instanceof URLSearchParams ? input : new URLSearchParams();
  if (!(input instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(input)) {
      if (Array.isArray(value)) return null;
      if (value !== undefined) params.append(key, value);
    }
  }
  if (params.toString().length > 1024) return null;
  const values: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const result = schema.safeParse(values);
  return result.success ? result.data : null;
}
export function recapShareParams(data: RecapShare) {
  const params = new URLSearchParams();
  for (const key of [
    'streamer',
    'date',
    'laughs',
    'minutes',
    'word',
    'funniest',
    'moment',
    'hype',
    'stream',
    'replay',
  ] as const) {
    const value = data[key];
    if (value !== undefined) params.set(key, String(value));
  }
  if (!parseRecapShare(params)) throw new Error('invalid recap stats');
  return params;
}
/** Always use configured SITE_URL, never a request Host/Origin or a query URL. */
export function recapShareUrl(site: string, data: RecapShare, image = false) {
  const base = new URL(site);
  if (
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !(
      base.protocol === 'https:' ||
      (base.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(base.hostname))
    )
  )
    throw new Error('invalid site origin');
  return `${base.origin}/r${image ? '/image' : ''}?${recapShareParams(data)}`;
}
