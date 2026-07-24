// The outbox drain (PR W5) — the widget → app half.
//
// The drain is the only thing standing between a Home Screen tap and a real
// record, so what is tested here is that it replays a capture through the
// SHIPPED W4 intent unchanged (same ids, same tap time, same provenance),
// applies an undo on either side of the drain, and never invents a row from a
// capture that names nothing.

import { applyOutbox, type DrainDeps } from './widgetBridge';
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

    expect(outcome).toEqual({ applied: 1, revoked: 0, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('logMeal');
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
    expect(calls.map((c) => c.fn)).toEqual(['logTreat', 'topUpBowl']);
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
    expect(calls).toHaveLength(0);
    expect(outcome).toEqual({ applied: 0, revoked: 0, failed: 2 });
  });

  it('a revoked capture is never applied (undo before the drain)', async () => {
    const { deps, calls } = fakeDeps();
    const record = capture();
    const outcome = await applyOutbox({ pending: [record], revoked: [record.id] }, deps);
    expect(calls.map((c) => c.fn)).toEqual(['revokeEvent']);
    expect(outcome).toMatchObject({ applied: 0, revoked: 1 });
  });

  it('a revoked capture already drained is soft-deleted (undo after the drain)', async () => {
    const { deps, calls } = fakeDeps();
    await applyOutbox({ pending: [], revoked: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }, deps);
    expect(calls).toEqual([
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
    expect(outcome).toMatchObject({ applied: 1, failed: 1 });
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
});
