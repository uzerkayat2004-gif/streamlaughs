import { expect, it, vi } from 'vitest';
import { SpeechBudget } from './speech-budget';

it('limits work in every rolling ten-second window and yields between inference calls', async () => {
  let now = 0;
  let yields = 0;
  const sleeps: number[] = [],
    events: { at: number; ms: number }[] = [];
  const budget = new SpeechBudget(
    () => now,
    async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    async () => {
      yields++;
      now += 2;
    },
  );
  for (let i = 0; i < 300; i++)
    await budget.run(async () => {
      now += 30;
      events.push({ at: now, ms: 30 });
    });
  for (const event of events)
    expect(
      events
        .filter((e) => e.at <= event.at && e.at > event.at - 10000)
        .reduce((n, e) => n + e.ms, 0),
    ).toBeLessThanOrEqual(1600);
  expect(yields).toBe(300);
  expect(sleeps.some((ms) => ms > 1000)).toBe(true);
});
it('does not delay a cheap decoder by reserving the much larger encoder estimate', async () => {
  let now = 0;
  const budget = new SpeechBudget(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  await budget.run(async () => {
    now += 1100;
  }, 'encoder');
  expect(
    await budget.run(async () => {
      now += 10;
      return 'bro';
    }, 'decoder'),
  ).toBe('bro');
  expect(now).toBeLessThan(2300);
});
it('backs off without cancelling the in-flight result or disabling laughter', async () => {
  let now = 0;
  const budget = new SpeechBudget(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  budget.backoff();
  expect(
    await budget.run(async () => {
      now += 20;
      return 'bro';
    }),
  ).toBe('bro');
  expect(now).toBeGreaterThanOrEqual(1020);
  expect(budget.diagnostics().backoffMs).toBe(0);
});

it('yields via messages even when hidden-worker timers would be throttled', async () => {
  const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => {
    throw new Error('timer would be throttled');
  });
  try {
    const budget = new SpeechBudget();
    expect(await budget.run(async () => 7)).toBe(7);
    expect(timer).not.toHaveBeenCalled();
  } finally {
    timer.mockRestore();
  }
});
