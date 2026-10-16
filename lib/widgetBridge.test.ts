// The bridge (Widget V2, PR 2) — publish v2 props, and the §3 one-time v1
// residual-outbox drain.
//
// v2 never writes, so the per-tick drain is gone; what remains is the UPGRADE
// path. `applyOutbox` (the v1 apply machinery — replay a capture through its W4
// intent, ingest between apply and revoke) is unchanged and still tested here,
// because `drainResidualV1Outbox` uses it to rescue a build-35 user's un-drained
// tap exactly once. The publish tests prove the v2 payload carries no outbox.

// captureInbox's ingest kicks a Signal regen per applied pet; the regen is not the
// subject here and pulls the Supabase client.
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import {
  applyOutbox,
  clearWidgetTimeline,
  drainResidualV1Outbox,
  fencedAllowlist,
  publishWidgetPass,
  publishWidgetTimeline,
  __setWidgetHandleForTests,
  type DrainDeps,
  type WidgetHandle,
} from './widgetBridge';
import type { CulpritWidgetProps, WidgetPendingCapture } from './widgetProps';
import { fenceWidgetPublish, widgetPublishEpoch } from './widgetSnapshot';
import { logMealIntent } from './widgetCapture';
import * as captureInbox from './captureInbox';
import { ingestCaptureRecords, type InboxDb } from './captureInbox';
import { usePetStore } from '../store/petStore';

const PET = '11111111-1111-4111-8111-111111111111';

function capture(overrides: Partial<WidgetPendingCapture> = {}): WidgetPendingCapture {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mealId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    kind: 'meal',
    petId: PET,
    foodItemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    occurredAt: '2026-07-24T17:05:00.000Z',
    label: "Dinner — Hill's z/d",
    ...overrides,
  };
}

function fakeDeps() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const ok = async () => ({ ok: true, record: null, direct: 'skipped' as const });
  const deps: DrainDeps = {
    logMeal: (async (...args: unknown[]) => {
      calls.push({ fn: 'logMeal', args });
      return ok();
    }) as unknown as DrainDeps['logMeal'],
    logTreat: (async (...args: unknown[]) => {
      calls.push({ fn: 'logTreat', args });
      return ok();
    }) as unknown as DrainDeps['logTreat'],
    topUpBowl: (async (...args: unknown[]) => {
      calls.push({ fn: 'topUpBowl', args });
      return ok();
    }) as unknown as DrainDeps['topUpBowl'],
    ingest: async () => {
      calls.push({ fn: 'ingest', args: [] });
    },
    revokeEvent: async (id: string) => {
      calls.push({ fn: 'revokeEvent', args: [id] });
    },
  };
  return { deps, calls };
}

describe('applyOutbox (the v1 apply machinery — reused by the §3 drain)', () => {
  it('replays a meal through logMealIntent with the WIDGET’s ids and tap time', async () => {
    const { deps, calls } = fakeDeps();
    const record = capture();
    const outcome = await applyOutbox({ pending: [record], revoked: [] }, deps);

    expect(outcome).toEqual({ applied: 1, revoked: 0, failed: [], deferredRevokes: [], fenced: false });
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest']);
    const [petId, foodItemId, opts] = calls[0].args as [string, string, Record<string, unknown>];
    expect(petId).toBe(PET);
    expect(foodItemId).toBe(record.foodItemId);
    expect(opts.ids).toEqual({ eventId: record.id, mealId: record.mealId });
    expect((opts.occurredAt as Date).toISOString()).toBe(record.occurredAt);
    expect(opts.loggedVia).toBe('widget');
  });

  it('routes a treat to logTreatIntent and a bowl top-up to topUpBowlIntent', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox(
      {
        pending: [
          capture({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'treat' }),
          capture({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', kind: 'bowl_topup', mealId: null, foodItemId: null }),
        ],
        revoked: [],
      },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['logTreat', 'topUpBowl', 'ingest']);
  });

  it('never writes a capture that names nothing (D2 survives the outbox hop)', async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await applyOutbox(
      { pending: [capture({ foodItemId: null }), capture({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', petId: '' })], revoked: [] },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['ingest']);
    expect(outcome.applied).toBe(0);
    expect(outcome.failed).toHaveLength(2);
  });

  it('INGESTS between applying and revoking (the order is the correctness argument)', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox({ pending: [capture()], revoked: ['77777777-7777-4777-8777-777777777777'] }, deps);
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest', 'revokeEvent']);
  });

  it('defers revocations (rather than burning them) when the ingest fails', async () => {
    const { deps } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const outcome = await applyOutbox({ pending: [], revoked: ['undo-me'] }, deps);
    expect(outcome.deferredRevokes).toEqual(['undo-me']);
  });
});

// ── The §3 one-time upgrade drain ────────────────────────────────────────────

describe('drainResidualV1Outbox', () => {
  function fakeWidget(entries: unknown[]) {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => entries as { date: Date; props: CulpritWidgetProps }[],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }

  afterEach(() => __setWidgetHandleForTests(null));

  it('applies a residual v1 capture found in the stored (v1-shaped) timeline', async () => {
    const { deps, calls } = fakeDeps();
    // A build-35 timeline entry carries the v1 outbox on its props.
    const { handle } = fakeWidget([{ date: new Date(), props: { schemaVersion: 1, pending: [capture()], revoked: [] } }]);
    __setWidgetHandleForTests(handle);

    const outcome = await drainResidualV1Outbox(deps);
    expect(outcome.applied).toBe(1);
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest']);
  });

  it('is a no-op on a v2 timeline (no outbox in the contract) — idempotent after the first publish', async () => {
    const { deps, calls } = fakeDeps();
    const { handle } = fakeWidget([{ date: new Date(), props: { schemaVersion: 2, pets: {}, signedIn: true } }]);
    __setWidgetHandleForTests(handle);

    const outcome = await drainResidualV1Outbox(deps);
    expect(outcome).toEqual({ applied: 0, revoked: 0, failed: [], deferredRevokes: [], fenced: false });
    expect(calls).toEqual([]); // nothing applied, no ingest
  });

  it('is a clean no-op when there is no widget (Android / Expo Go / pre-widget build)', async () => {
    __setWidgetHandleForTests(null);
    await expect(drainResidualV1Outbox()).resolves.toEqual({ applied: 0, revoked: 0, failed: [], deferredRevokes: [], fenced: false });
  });
});

// ── Publish ──────────────────────────────────────────────────────────────────

describe('publishWidgetTimeline / clearWidgetTimeline', () => {
  function fakeWidget() {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => [],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }

  afterEach(() => __setWidgetHandleForTests(null));

  it('publishes both timeline entries (now + midnight) carrying the v2 props', () => {
    const { handle, published } = fakeWidget();
    __setWidgetHandleForTests(handle);
    const props: CulpritWidgetProps = { schemaVersion: 2, pets: {}, signedIn: true };
    publishWidgetTimeline(props, new Date(2026, 6, 24, 21, 30));
    expect(published).toHaveLength(2);
    expect(published[0]).toBe(props);
    expect(published[1]).toBe(props);
  });

  it('clearWidgetTimeline publishes the signed-out v2 props (schema 2, no outbox)', () => {
    const { handle, published } = fakeWidget();
    __setWidgetHandleForTests(handle);
    clearWidgetTimeline();
    expect(published[0]).toEqual({ schemaVersion: 2, pets: {}, signedIn: false });
  });
});

// ── The drain-gated publish seam (the residual-drain data-loss fix) ───────────
//
// A partial upgrade drain must NOT overwrite the v1 timeline — that timeline is
// the un-applied tap's only durable copy. These pin that the publish is withheld
// exactly when the drain came back incomplete.
describe('publishWidgetPass', () => {
  function fakeWidget(timeline: unknown[]) {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => timeline as { date: Date; props: CulpritWidgetProps }[],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }
  const v2Props = (): CulpritWidgetProps => ({ schemaVersion: 2, pets: {}, signedIn: true });

  afterEach(() => __setWidgetHandleForTests(null));

  it('publishes after a clean residual drain and reports drainComplete', async () => {
    const { deps } = fakeDeps();
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [capture()], revoked: [] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(true);
    expect(published).toHaveLength(2); // now + midnight
  });

  it('does NOT publish when a residual capture fails to apply — the v1 timeline is preserved', async () => {
    const { deps } = fakeDeps();
    // A capture that names nothing can never be applied → outcome.failed.
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [capture({ foodItemId: null })], revoked: [] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(false);
    expect(published).toHaveLength(0); // the timeline holding the un-applied tap is untouched
  });

  it('does NOT publish when a revoke is deferred (ingest failed)', async () => {
    const { deps } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { schemaVersion: 1, pending: [], revoked: ['undo-me'] } },
    ]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(false);
    expect(published).toHaveLength(0);
  });

  it('publishes directly when no drain is needed (steady state) — and never touches the drain', async () => {
    const { deps, calls } = fakeDeps();
    const { handle, published } = fakeWidget([]);
    __setWidgetHandleForTests(handle);
    let built = false;
    const res = await publishWidgetPass(
      async () => {
        built = true;
        return v2Props();
      },
      { needsDrain: false, deps },
    );
    expect(res.drainComplete).toBe(true);
    expect(built).toBe(true);
    expect(published).toHaveLength(2);
    expect(calls).toEqual([]); // no apply / ingest — the drain was skipped entirely
  });

  it('a clean v2 timeline (no residual) publishes on the first pass', async () => {
    const { deps } = fakeDeps();
    const { handle, published } = fakeWidget([{ date: new Date(), props: v2Props() }]);
    __setWidgetHandleForTests(handle);
    const res = await publishWidgetPass(async () => v2Props(), { needsDrain: true, deps });
    expect(res.drainComplete).toBe(true);
    expect(published).toHaveLength(2);
  });
});

// ── The sign-out fence on a drain already running (CUL-1960) ──────────────────
//
// CUL-1952 fenced a drain that had not started; these pin the one that HAS. The
// fence is the real `fenceWidgetPublish` (what `wipeLocalSession` calls), landed
// from inside a step's await, which is where a real sign-out lands.
describe('a drain already running at sign-out stops at its next step', () => {
  const SECOND = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const second = () => capture({ id: SECOND, mealId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });

  // The real intent, with the App Group's inbox replaced by a recorder. Sign-out
  // lands during the FIRST capture's direct REST leg (its first await), after that
  // capture's own inbox write, exactly as on a device.
  function realIntentDeps() {
    const inbox: string[] = [];
    const { deps, calls } = fakeDeps();
    let fenceOnFirstSession = true;
    deps.logMeal = (petId, foodItemId, opts) =>
      logMealIntent(petId, foodItemId, {
        ...opts,
        deps: {
          writeInboxFile: (name) => {
            inbox.push(name);
          },
          restConfig: { url: 'https://example.invalid', anonKey: 'anon' },
          readSession: async () => {
            if (fenceOnFirstSession) {
              fenceOnFirstSession = false;
              fenceWidgetPublish();
            }
            return null;
          },
        },
      });
    return { deps, calls, inbox };
  }

  it('fenced mid-apply: no capture-inbox file after the fence, no ingest, no revoke', async () => {
    const { deps, calls, inbox } = realIntentDeps();
    const epoch = widgetPublishEpoch();
    const outcome = await applyOutbox(
      { pending: [capture(), second()], revoked: ['77777777-7777-4777-8777-777777777777'] },
      deps,
      epoch,
    );
    // The first capture was written BEFORE the fence; the second never was.
    expect(inbox).toEqual([`${capture().id}.json`]);
    expect(calls.map((c) => c.fn)).toEqual([]); // no ingest, no revoke
    expect(outcome.fenced).toBe(true);
    expect(outcome.failed.map((c) => c.id)).toEqual([SECOND]);
  });

  it('an unfenced drain still applies every capture, ingests and revokes', async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await applyOutbox(
      { pending: [capture(), second()], revoked: ['77777777-7777-4777-8777-777777777777'] },
      deps,
      widgetPublishEpoch(),
    );
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'logMeal', 'ingest', 'revokeEvent']);
    expect(outcome).toEqual({ applied: 2, revoked: 1, failed: [], deferredRevokes: [], fenced: false });
  });

  it('fenced during the ingest: revokes nothing after it', async () => {
    const { deps, calls } = fakeDeps();
    deps.ingest = async () => {
      calls.push({ fn: 'ingest', args: [] });
      fenceWidgetPublish();
    };
    const outcome = await applyOutbox({ pending: [], revoked: ['undo-me'] }, deps, widgetPublishEpoch());
    expect(calls.map((c) => c.fn)).toEqual(['ingest']);
    expect(outcome.fenced).toBe(true);
  });

  it('a fenced drain publishes nothing over the signed-out timeline', async () => {
    const { deps } = fakeDeps();
    deps.logMeal = (async () => {
      fenceWidgetPublish();
      return { ok: true, record: null, direct: 'skipped' as const };
    }) as unknown as DrainDeps['logMeal'];
    const published: CulpritWidgetProps[] = [];
    __setWidgetHandleForTests({
      getTimeline: async () =>
        [{ date: new Date(), props: { schemaVersion: 1, pending: [capture()], revoked: [] } }] as unknown as {
          date: Date;
          props: CulpritWidgetProps;
        }[],
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    });
    let built = false;
    const res = await publishWidgetPass(
      async () => {
        built = true;
        return { schemaVersion: 2, pets: {}, signedIn: true };
      },
      { needsDrain: true, deps, epoch: widgetPublishEpoch() },
    );
    __setWidgetHandleForTests(null);
    expect(res.drainComplete).toBe(false);
    expect(built).toBe(false);
    expect(published).toHaveLength(0);
  });

  // The ingest half. The wipe clears SQLite before it resets the pet store, so the
  // allowlist still names the old pets; an ingest already running must stop
  // admitting them. Driven through the real `ingestCaptureRecords`, which asks the
  // allowlist once per record: sign-out lands inside the first record's writes.
  it('fenced mid-ingest: the old account writes no meal row after the fence', async () => {
    const epoch = widgetPublishEpoch();
    const fenced = () => widgetPublishEpoch() !== epoch;
    const record = (id: string, mealId: string) => ({
      schemaVersion: 1,
      id,
      mealId,
      kind: 'meal',
      petId: PET,
      foodItemId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      occurredAt: '2026-07-24T18:00:00.000Z',
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      loggedVia: 'widget',
    });
    const files = [
      { name: 'a.json', raw: JSON.stringify(record(capture().id, capture().mealId as string)) },
      { name: 'b.json', raw: JSON.stringify(record(SECOND, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')) },
    ];
    const mealInserts: unknown[] = [];
    const db: InboxDb = {
      runAsync: async (sql, params) => {
        if (/INSERT OR IGNORE INTO meals/.test(sql)) {
          mealInserts.push(params[0]);
          fenceWidgetPublish(); // sign-out lands during the first record's writes
        }
        return { changes: 1 };
      },
      getFirstAsync: async <T,>() => ({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }) as T,
      getAllAsync: async <T,>() => [] as T[],
    };
    const decisions = await ingestCaptureRecords(db, files, fencedAllowlist(new Set([PET]), fenced));
    expect(mealInserts).toEqual(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    expect(decisions.map((d) => d.action)).toEqual(['applied', 'deferred']);
  });

  it('the fenced allowlist answers like the set until the fence moves', () => {
    const epoch = widgetPublishEpoch();
    const view = fencedAllowlist(new Set([PET]), () => widgetPublishEpoch() !== epoch);
    expect(view.has(PET)).toBe(true);
    expect([...view]).toEqual([PET]);
    fenceWidgetPublish();
    expect(view.has(PET)).toBe(false);
    expect([...view]).toEqual([]);
    expect(view.size).toBe(1); // never reads as "pets not loaded"
  });

  it('the shipped ingest hands captureInbox the fenced allowlist, not the raw pet set', async () => {
    const spy = jest.spyOn(captureInbox, 'ingestCaptureInbox').mockResolvedValue(undefined);
    usePetStore.setState({ pets: [{ id: PET }] as never });
    try {
      await applyOutbox({ pending: [], revoked: [] }, undefined, widgetPublishEpoch());
      const allowlist = spy.mock.calls[0][0];
      // CUL-1968: the same fence reaches the ingest itself, which re-reads it before
      // every write, so the record whose `has()` already passed stops too.
      const fenced = spy.mock.calls[0][1] as () => boolean;
      expect(allowlist.has(PET)).toBe(true);
      expect(fenced()).toBe(false);
      fenceWidgetPublish();
      expect(allowlist.has(PET)).toBe(false);
      expect(fenced()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
