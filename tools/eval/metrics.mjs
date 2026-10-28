export function evaluate(labels, events, segments = []) {
  const result = {};
  for (const kind of ['laugh', 'speech', 'scream']) {
    const expected = labels.filter((x) => x.label === kind),
      used = new Set();
    const predictions =
      kind === 'speech'
        ? segments.map((s) => ({ ts: (s.start - 100000) / 1000 }))
        : events
            .filter((e) => e.kind === kind)
            .map((e) => ({ ts: (e.ts - 100000) / 1000 }));
    let tp = 0,
      fp = 0;
    for (const p of predictions) {
      const i = expected.findIndex(
        (l, i) => !used.has(i) && p.ts >= l.start - 0.5 && p.ts <= l.end + 1,
      );
      if (i >= 0) {
        used.add(i);
        tp++;
      } else fp++;
    }
    result[kind] = {
      tp,
      fp,
      fn: expected.length - tp,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: expected.length ? tp / expected.length : null,
    };
  }
  const negatives = ['stream-through-speakers', 'silence', 'keyboard'];
  for (const kind of negatives) {
    const spans = labels.filter((l) => l.label === kind);
    result[kind] = {
      falsePositives: events.filter(
        (e) =>
          e.kind !== 'words' &&
          spans.some(
            (l) =>
              (e.ts - 100000) / 1000 >= l.start &&
              (e.ts - 100000) / 1000 <= l.end,
          ),
      ).length,
      minutes: spans.reduce((s, l) => s + l.end - l.start, 0) / 60,
    };
  }
  return result;
}
