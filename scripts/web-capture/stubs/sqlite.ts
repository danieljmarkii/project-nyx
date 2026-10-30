// Web wrapper for expo-sqlite (CUL-1895 capture path only; metroWebCapture.js swaps it
// in for platform 'web' when NYX_WEB_CAPTURE=1). The engine underneath is still the real
// one: expo-sqlite's own wa-sqlite build, so lib/db.ts's schema and every query run
// as written.
//
// Why a wrapper at all: lib/db.ts opens with `openDatabaseSync` on first use, and on
// web a sync call busy-waits on the main thread for a worker that cannot start until
// the main thread yields, so the first open always times out. Here the open is async
// and the handle is a facade: every *Async method waits for the real database, and
// the two sync reads the app makes (lib/ask.ts, hooks/useSignal.ts) forward once it is
// open.
//
// It also counts what is in flight (CUL-2266): capture.mjs photographs a screen only once
// `__NYX_CAPTURE_DB` reads idle and unchanged, because a hydrate writing rows the screen has
// not read yet looks, from outside, exactly like a settled screen.
// The real module by file path: the bare name resolves back to this wrapper.
import type * as RealModule from 'expo-sqlite';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Real: typeof RealModule = require('expo-sqlite/build/index');

// @ts-expect-error the package's exports map hides build/ from tsc; Metro resolves it.
export * from 'expo-sqlite/build/index';

type RealDb = RealModule.SQLiteDatabase;

const activity: { busy: number; done: number } = ((globalThis as { __NYX_CAPTURE_DB?: { busy: number; done: number } })
  .__NYX_CAPTURE_DB ??= { busy: 0, done: 0 });

const opened = new Map<string, Promise<RealDb>>();
const ready = new Map<string, RealDb>();

function open(name: string): Promise<RealDb> {
  const existing = opened.get(name);
  if (existing) return existing;
  const p = Real.openDatabaseAsync(name).then((db: RealDb) => {
    ready.set(name, db);
    return db;
  });
  opened.set(name, p);
  return p;
}

export function openDatabaseSync(name: string): RealDb {
  const pending = open(name);
  return new Proxy({} as RealDb, {
    get(_target, key: string | symbol) {
      const db = ready.get(name);
      if (typeof key === 'string' && key.endsWith('Async')) {
        return async (...args: unknown[]) => {
          activity.busy++;
          try {
            const real = await pending;
            return await (real as unknown as Record<string, (...a: unknown[]) => unknown>)[key](...args);
          } finally {
            activity.busy--;
            activity.done++;
          }
        };
      }
      if (!db) {
        if (typeof key === 'string' && key.endsWith('Sync')) {
          throw new Error(`web capture: ${key} before the database opened`);
        }
        return undefined;
      }
      const value = (db as unknown as Record<string | symbol, unknown>)[key];
      return typeof value === 'function' ? value.bind(db) : value;
    },
  });
}

export async function openDatabaseAsync(name: string): Promise<RealDb> {
  return open(name);
}
