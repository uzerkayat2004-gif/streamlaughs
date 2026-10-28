import {
  initialSnapshot,
  type Snapshot,
  SnapshotSchema,
} from '@laughline/shared';
import { createStore } from 'zustand/vanilla';
export function createSurfaceStore() {
  const store = createStore<{ snapshot: Snapshot; ready: boolean }>(() => ({
    snapshot: initialSnapshot(),
    ready: false,
  }));
  const accept = (payload: unknown) => {
    const parsed = SnapshotSchema.safeParse(payload);
    if (
      parsed.success &&
      (!store.getState().ready ||
        parsed.data.revision > store.getState().snapshot.revision)
    )
      store.setState({ snapshot: parsed.data, ready: true });
  };
  return { store, accept };
}
