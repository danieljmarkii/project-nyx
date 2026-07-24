// The outbox drain (PR W5) — the widget → app half.
//
// The drain is the only thing standing between a Home Screen tap and a real
// record, so what is tested here is that it replays a capture through the
// SHIPPED W4 intent unchanged (same ids, same tap time, same provenance),
// applies an undo on either side of the drain, and never invents a row from a
// capture that names nothing.

import {
  applyOutbox,
  syncWidget,
  __setWidgetHandleForTests,
  type DrainDeps,
  type WidgetHandle,
} from './widgetBridge';
import type { CulpritWidgetProps } from './widgetProps';
import type { WidgetPendingCapture } from './widgetProps';

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
  const ok = async (...args: unknown[]) => ({ ok: true, record: null, direct: 'skipped' as const });
  const deps: DrainDeps = {
    logMeal: (async (...args: unknown[]) => {
      calls.push({ fn: 'logMeal', args });
      return ok(...args);
    }) as unknown as DrainDeps['logMeal'],
    logTreat: (async (...args: unknown[]) => {
      calls.push({ fn: 'logTreat', args });
      return ok(...args);
    }) as unknown as DrainDeps['logTreat'],
    topUpBowl: (async (...args: unknown[]) => {
      calls.push({ fn: 'topUpBowl', args });
      return ok(...args);
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

describe('applyOutbox', () => {
  it('replays a meal through logMealIntent with the WIDGET’s ids and tap time', async () => {
    const { deps, calls } = fakeDeps();
    const record = capture();
    const outcome = await applyOutbox({ pending: [record], revoked: [] }, deps);

    expect(outcome).toEqual({ applied: 1, revoked: 0, failed: [], deferredRevokes: [] });
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest']);
    const [petId, foodItemId, opts] = calls[0].args as [string, string, Record<string, unknown>];
    expect(petId).toBe(PET);
    expect(foodItemId).toBe(record.foodItemId);
    // Ids and time come from the tap, not from drain time — that is what keeps
    // the chain idempotent and `occurred_at` honest across the outbox hop.
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
          capture({
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            kind: 'bowl_topup',
            mealId: null,
            foodItemId: null,
          }),
        ],
        revoked: [],
      },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['logTreat', 'topUpBowl', 'ingest']);
    const bowlOpts = calls[1].args[1] as Record<string, unknown>;
    expect(bowlOpts.id).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  });

  it('never writes a capture that names nothing (D2 survives the outbox hop)', async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await applyOutbox(
      {
        pending: [
          capture({ foodItemId: null }),
          capture({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', petId: '' }),
        ],
        revoked: [],
      },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['ingest']);
    // The unapplied captures are HANDED BACK so the publish can re-seed them —
    // a failed tap is retried, never silently dropped.
    expect(outcome.applied).toBe(0);
    expect(outcome.failed.map((c) => c.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ]);
  });

  it('a revoked capture is never applied (undo before the drain)', async () => {
    const { deps, calls } = fakeDeps();
    const record = capture();
    const outcome = await applyOutbox({ pending: [record], revoked: [record.id] }, deps);
    expect(calls.map((c) => c.fn)).toEqual(['ingest', 'revokeEvent']);
    expect(outcome).toMatchObject({ applied: 0, revoked: 1, failed: [] });
  });

  it('a revoked capture already drained is soft-deleted (undo after the drain)', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox({ pending: [], revoked: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }, deps);
    expect(calls).toEqual([
      { fn: 'ingest', args: [] },
      { fn: 'revokeEvent', args: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
    ]);
  });

  it('one failing capture never strands the rest of the batch', async () => {
    const { deps, calls } = fakeDeps();
    const boom = deps.logMeal;
    let first = true;
    deps.logMeal = (async (...args: unknown[]) => {
      if (first) {
        first = false;
        throw new Error('inbox unavailable');
      }
      return (boom as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as unknown as DrainDeps['logMeal'];

    const outcome = await applyOutbox(
      {
        pending: [capture(), capture({ id: '99999999-9999-4999-8999-999999999999' })],
        revoked: [],
      },
      deps,
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.failed).toHaveLength(1);
    expect(calls.filter((c) => c.fn === 'logMeal')).toHaveLength(1);
  });

  it('a failed revoke never aborts the pass', async () => {
    const { deps } = fakeDeps();
    deps.revokeEvent = async () => {
      throw new Error('db closed');
    };
    await expect(applyOutbox({ pending: [], revoked: ['x'] }, deps)).resolves.toMatchObject({
      revoked: 1,
    });
  });

  // ── The ordering that makes the whole thing correct ───────────────────────

  it('INGESTS between applying and revoking', async () => {
    // Apply writes an inbox file; only the ingest puts the row in local SQLite.
    // Revoking first would soft-delete a row that isn't there yet — a silent
    // no-op — and the inbox record, which knows nothing about revocations,
    // would then insert the event the owner explicitly undid.
    const { deps, calls } = fakeDeps();
    await applyOutbox(
      {
        pending: [capture()],
        revoked: ['77777777-7777-4777-8777-777777777777'],
      },
      deps,
    );
    expect(calls.map((c) => c.fn)).toEqual(['logMeal', 'ingest', 'revokeEvent']);
  });

  it('defers revocations (rather than burning them) when the ingest fails', async () => {
    const { deps, calls } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const outcome = await applyOutbox({ pending: [], revoked: ['undo-me'] }, deps);
    expect(calls.filter((c) => c.fn === 'revokeEvent')).toHaveLength(0);
    expect(outcome.revoked).toBe(0);
    expect(outcome.deferredRevokes).toEqual(['undo-me']);
  });
});

// ── The seam the whole thing turns on ────────────────────────────────────────
//
// `syncWidget` takes a props BUILDER, not props, precisely so the snapshot is
// read after the drain has applied and ingested. Building first would republish
// a status column that pre-dates the tap — dropping the ✓ on a capture that
// succeeded, and inviting a duplicate log.

describe('syncWidget', () => {
  function fakeWidget(entries: { date: Date; props: CulpritWidgetProps }[]) {
    const published: CulpritWidgetProps[] = [];
    const handle: WidgetHandle = {
      getTimeline: async () => entries,
      updateTimeline: (next) => next.forEach((e) => published.push(e.props)),
    };
    return { handle, published };
  }

  const emptyProps = (): CulpritWidgetProps => ({
    schemaVersion: 1,
    pets: {},
    signedIn: true,
    ui: {},
    pending: [],
    revoked: [],
  });

  afterEach(() => __setWidgetHandleForTests(null));

  it('builds the props AFTER draining, and clears the outbox on the way out', async () => {
    const order: string[] = [];
    const { deps } = fakeDeps();
    const record = capture();
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { ...emptyProps(), pending: [record] } },
    ]);
    __setWidgetHandleForTests(handle);

    const wrapped: DrainDeps = {
      ...deps,
      logMeal: (async (...args: unknown[]) => {
        order.push('apply');
        return (deps.logMeal as unknown as (...a: unknown[]) => Promise<unknown>)(...args);
      }) as unknown as DrainDeps['logMeal'],
      ingest: async () => {
        order.push('ingest');
      },
    };

    await syncWidget(
      async () => {
        order.push('build-props');
        return emptyProps();
      },
      { deps: wrapped },
    );

    expect(order).toEqual(['apply', 'ingest', 'build-props']);
    // Two entries (now + the midnight rollover), both carrying the fresh props.
    expect(published).toHaveLength(2);
    expect(published[0].pending).toEqual([]); // the drained tap is gone
  });

  it('re-seeds an unapplied capture so a failed tap is retried, not lost', async () => {
    const { deps } = fakeDeps();
    // A capture that names nothing can never be applied.
    const broken = capture({ foodItemId: null });
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { ...emptyProps(), pending: [broken] } },
    ]);
    __setWidgetHandleForTests(handle);

    const outcome = await syncWidget(async () => emptyProps(), { deps });

    expect(outcome.failed).toHaveLength(1);
    expect(published[0].pending.map((p) => p.id)).toEqual([broken.id]);
  });

  it('carries a deferred revocation forward when the ingest failed', async () => {
    const { deps } = fakeDeps();
    deps.ingest = async () => {
      throw new Error('db locked');
    };
    const { handle, published } = fakeWidget([
      { date: new Date(), props: { ...emptyProps(), revoked: ['undo-me'] } },
    ]);
    __setWidgetHandleForTests(handle);

    await syncWidget(async () => emptyProps(), { deps });

    expect(published[0].revoked).toEqual(['undo-me']);
  });
});
