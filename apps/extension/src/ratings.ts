import {
  canRateStream,
  LocalRatingSchema,
  ratingId,
  ratingLocked,
  RatingRequestSchema,
  type LocalRating,
  type RatingReason,
} from '@laughline/shared';
import { db } from './db';
const INSTALL_KEY = 'streamlaughs:rating-install';
export async function sendStreamRating(
  recapId: string,
  score: number,
  reasons: RatingReason[],
  api = import.meta.env.VITE_CROWD_API_URL ?? '',
): Promise<LocalRating> {
  return navigator.locks.request('streamlaughs:rating-send', async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (!state?.ok || state.state.settings.sendRatings === false)
      throw new Error('ratings are off · turn them on in settings');
    const recap = await db.recaps.get(recapId);
    if (!recap || !canRateStream(recap) || !recap.streamKey)
      throw new Error('live streams of 10+ minutes only');
    const id = ratingId(recap.channel, recap.streamKey),
      existing = await db.ratings.get(id),
      now = Date.now();
    if (existing && ratingLocked(existing, now))
      throw new Error('this rating is locked · back to your recap');
    if (!api) throw new Error('ratings unavailable · try again later');
    let install = (await chrome.storage.local.get(INSTALL_KEY))[INSTALL_KEY];
    if (
      typeof install !== 'string' ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(install)
    ) {
      install = crypto.randomUUID();
      await chrome.storage.local.set({ [INSTALL_KEY]: install });
    }
    const body = RatingRequestSchema.parse({
      channel: recap.channel,
      streamKey: recap.streamKey,
      score,
      reasons,
    });
    const response = await fetch(`${new URL(api).origin}/v1/ratings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${install}`,
      },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? 'this rating is locked · back to your recap'
          : response.status === 429
            ? 'one little minute · try again'
            : 'couldn’t send · try again',
      );
    const rating = LocalRatingSchema.parse({
      ...body,
      id,
      firstSubmittedAt: existing?.firstSubmittedAt ?? now,
      updatedAt: now,
    });
    await db.transaction('rw', db.ratings, db.recaps, db.sessions, async () => {
      await db.ratings.put(rating);
      await db.recaps
        .where('channel')
        .equals(recap.channel)
        .filter((r) => r.streamKey === recap.streamKey)
        .modify({ rating: score });
      await db.sessions
        .where('channel')
        .equals(recap.channel)
        .filter((s) => s.streamKey === recap.streamKey)
        .modify({ rating: score });
    });
    return rating;
  });
}
