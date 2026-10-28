import { initialSnapshot } from '@laughline/shared';
import { expect, it } from 'vitest';
import { createSurfaceStore } from './sync-store';

it('hydrates independent stores and applies storage/message updates exactly once', () => {
  const popup = createSurfaceStore(),
    content = createSurfaceStore();
  const state = {
    ...initialSnapshot(),
    revision: 2,
    settings: { listen: false, share: true },
  };
  popup.accept(state);
  content.accept(state);
  expect(popup.store.getState()).toEqual(content.store.getState());
  popup.accept({
    ...state,
    revision: 1,
    settings: { listen: true, share: true },
  });
  popup.accept({
    ...state,
    revision: 2,
    settings: { listen: true, share: true },
  });
  popup.accept({ revision: 999, status: 'broken' });
  expect(popup.store.getState().snapshot.settings.listen).toBe(false);
  content.accept({
    ...state,
    revision: 3,
    settings: { listen: true, share: false },
  });
  expect(popup.store.getState().snapshot.revision).toBe(2);
  expect(content.store.getState().snapshot.settings.share).toBe(false);
});
