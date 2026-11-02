import type { MySession } from './index';
type Laugh = MySession['laughEvents'][number];
export function withLaughs(
  session: MySession,
  laughEvents: Laugh[],
): MySession {
  const oldTimes = new Set(session.laughEvents.map((e) => e.at)),
    newTimes = new Set(laughEvents.map((e) => e.at));
  const removed = session.laughEvents.filter((e) => !newTimes.has(e.at)),
    added = laughEvents.filter((e) => !oldTimes.has(e.at));
  const delta = (select: (e: Laugh) => number) =>
    added.reduce((n, e) => n + select(e), 0) -
    removed.reduce((n, e) => n + select(e), 0);
  const hardest = [...laughEvents].sort(
    (a, b) =>
      (b.intensity ?? 1) - (a.intensity ?? 1) ||
      (b.confidence ?? 0.5) - (a.confidence ?? 0.5),
  )[0];
  return {
    ...session,
    laughCount: Math.max(
      0,
      session.laughCount + laughEvents.length - session.laughEvents.length,
    ),
    laughEvents,
    personal: {
      ...session.personal,
      intensitySum: Math.max(
        0,
        session.personal.intensitySum + delta((e) => e.intensity ?? 1),
      ),
      lagSum: Math.max(0, session.personal.lagSum + delta((e) => e.lagMs ?? 0)),
      lagCount: Math.max(
        0,
        session.personal.lagCount +
          delta((e) => (e.lagMs === undefined ? 0 : 1)),
      ),
      hardest:
        session.personal.hardest &&
        !removed.some((e) => e.at === session.personal.hardest!.ts) &&
        (!hardest ||
          session.personal.hardest.intensity > (hardest.intensity ?? 1) ||
          (session.personal.hardest.intensity === (hardest.intensity ?? 1) &&
            session.personal.hardest.confidence >= (hardest.confidence ?? 0.5)))
          ? session.personal.hardest
          : hardest
            ? {
                ts: hardest.at,
                intensity: hardest.intensity ?? 1,
                confidence: hardest.confidence ?? 0.5,
                crowd: hardest.crowd,
                ...(hardest.mediaAt === undefined
                  ? {}
                  : { mediaAt: hardest.mediaAt }),
              }
            : null,
    },
  };
}
