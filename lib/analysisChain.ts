// The analysis-chain claim registry (CUL-801), in a module of its own so a surface
// that only OBSERVES a read can ask whether one is in flight without importing the
// sync layer `lib/analysis.ts` stands on (HV-5 / CUL-1162: the Signal screen's reader
// needs the fact, and pulling `lib/sync.ts` into a pure model would drag its whole
// graph into every test of it). Moved verbatim; `lib/analysis.ts` re-exports all
// three functions, so no caller's import changed.
//
// Imports nothing: the Map below is the one registry, and a module with no imports
// has exactly one instance however it is reached.
//
// A CLAIM IS ANNOUNCED (the adversarial pass's F1 on #912). Home samples
// `analysisChainOutstanding` when it reads and rereads when a chain it sampled settles,
// so a chain claimed AFTER Home last looked was invisible to it: a photo added or
// replaced on the record screen, the section's own trigger, Try again. Calm words stood
// over a photo nothing had read, and stayed there after the copy held the rose. Every
// claim now calls the listeners `onAnalysisChainClaimed` registered; `lib/analysis.ts`
// registers the one that tells Home. The registry still knows nothing about Home.

// ── One read per photo: the analysis-chain claim (CUL-801) ────────────────────
//
// Two independent paths trigger a per-incident read for the same event: the log
// path (lib/simpleEvent.ts attachPhotoBestEffort — compress → upload → invoke)
// and the incident screen's mount (VomitAnalysisSection / StoolAnalysisSection).
// Before CUL-800 routed owners to that screen an immediate detail-open was rare;
// with the route it is EVERY photographed incident. Two invocations are not a
// harmless duplicate — the analyze-* functions upsert, so nothing corrupts, but:
//   · each call increments the usage counter (incident-analysis.ts step 4), so a
//     10/day cap is really 5 photographed incidents a day;
//   · the two write-backs are last-writer-wins over two INDEPENDENT model runs,
//     so the card can change under an owner who is already reading it;
//   · worst, if the second call is the one that crosses the cap it takes the
//     gated branch while the first call's read has not landed yet — so
//     `existingRealAnalysis` is still false there and a 'capped' state is
//     written OVER a good read of a photo that did land.
//
// The fix is a claim, held in memory for the life of the process and keyed by
// event id: whoever starts a chain owns that event's first read, and anyone else
// AWAITS it rather than starting a second one.
//
// WHY IN MEMORY, and not the `pending` row migration 013 originally described.
// A persisted row would have to survive a process death to be worth writing, and
// that is exactly when it becomes a trap: an app killed mid-upload would leave a
// 'pending' row no chain is coming back for. The recovery today is that start()
// finds NO row and triggers; a persisted claim would have to be distinguishable
// from a stuck one to keep it, and nothing can make that distinction from the
// row alone. An in-memory claim dies with the process, so the recovery survives
// by construction — the claim can only ever suppress a trigger while the runtime
// that owes the read is still alive to make it.
//
// (Migration 013's header says analysis rows are "created by the client on log
// (status='pending')" and the column defaults to it. That was never built: every
// write of `status` is the Edge Function's — completed / uncertain / capped /
// read_disabled / failed — and no client inserts the row. The sections' "stale
// pending → re-trigger" branch is therefore dead code against today's server, not
// the live recovery an earlier draft of this comment claimed it was.)
//
// WHY AWAIT, and not skip-if-claimed. A chain can settle without ever invoking
// (the upload threw, the attachment upsert errored). A skip would then leave the
// incident with no read at all — no descriptive read AND no deterministic
// escalation — which is the one outcome this must never produce.
// `awaitAnalysisChain` resolves FALSE in exactly that case, and the caller
// triggers its own read.
//
// WHAT THIS DOES NOT CLOSE, stated rather than left to be discovered. The claim
// covers the window while a chain is RUNNING, not after it: a caller arriving
// once a chain has settled gets false and decides for itself. Covering that is
// the SECTION's job, not the claim's — start() reads the row first, and the Edge
// Function writes its row before it responds, so by the time an invoke resolves
// the row exists and start() returns on it. The residual is a section that
// completes its read inside the milliseconds between that DB write and the
// response landing; it degrades to exactly the pre-CUL-801 behaviour (one extra
// call), never to anything worse, which is why it does not buy a settled-chain
// cache — a cache with an expiry would also have to be prevented from swallowing
// a legitimate retry after the watch gives up.

export interface AnalysisChainClaim {
  /** Release everyone awaiting this event's chain. `invoked` is true only when an
   *  analyze-* call was actually made AND accepted; false means the chain died
   *  before the read, so an awaiting caller must trigger one itself. Idempotent. */
  settle: (invoked: boolean) => void;
}

interface ChainSlot {
  promise: Promise<boolean>;
  resolve: (invoked: boolean) => void;
}

const analysisChains = new Map<string, ChainSlot>();

type ClaimListener = (eventId: string) => void;
const claimListeners = new Set<ClaimListener>();

/** Hear about every chain the moment it is claimed. Returns the unsubscribe. A listener
 *  runs after the claim is in place, so asking `analysisChainOutstanding` from inside it
 *  answers true; one that throws is said and skipped, never allowed to fail the claim
 *  (the claim is what keeps a photo to one read). */
export function onAnalysisChainClaimed(listener: ClaimListener): () => void {
  claimListeners.add(listener);
  return () => {
    claimListeners.delete(listener);
  };
}

/** Claim this event's first read. Returns null when a chain is ALREADY claimed —
 *  the caller does not own it and must not settle it (the owner will, and until
 *  then `awaitAnalysisChain` holds anyone who asks). Nesting is therefore safe:
 *  the log path claims before its upload, and the trigger it eventually calls
 *  finds the claim taken and leaves the settle to its owner. */
export function claimAnalysisChain(eventId: string): AnalysisChainClaim | null {
  if (analysisChains.has(eventId)) return null;
  let resolve!: (invoked: boolean) => void;
  const promise = new Promise<boolean>((r) => { resolve = r; });
  const slot: ChainSlot = { promise, resolve };
  analysisChains.set(eventId, slot);
  for (const listener of [...claimListeners]) {
    try {
      listener(eventId);
    } catch (e) {
      console.warn('[analysis-chain] a claim listener failed:', e);
    }
  }
  let settled = false;
  return {
    settle(invoked: boolean) {
      if (settled) return;
      settled = true;
      // Identity-checked, not key-checked (the CUL-622 lesson): a settle arriving
      // after the map moved on must never delete a NEWER chain's slot. Wiring
      // rather than a live gate — the `settled` flag above already makes a second
      // settle unreachable, so nothing in this API can exercise this comparison
      // today (its test says so plainly rather than pretending to prove it). It
      // stays because dropping the flag in a later refactor would make it live,
      // and the failure it prevents is silent: an unclaimed key hands the next
      // mount a second invoke.
      if (analysisChains.get(eventId) === slot) analysisChains.delete(eventId);
      resolve(invoked);
    },
  };
}

/** True once an outstanding chain for this event has made its analyze-* call.
 *  False immediately when no chain is outstanding, and false when one settles
 *  without ever invoking — both mean "no read is coming, trigger your own". */
export function awaitAnalysisChain(eventId: string): Promise<boolean> {
  return analysisChains.get(eventId)?.promise ?? Promise.resolve(false);
}

/** Is a chain claimed and not yet settled for this event? The `working` FACT for a
 *  surface that only OBSERVES a read (Home's spine node, D2-4 / CUL-1066; C-30): true
 *  means this runtime has asked, or is about to ask, the server for this event's read,
 *  which is what the arrival's trigger must switch on — never "the pending box is on
 *  screen". Home never triggers; it awaits the claim it finds (`awaitAnalysisChain`)
 *  and re-reads the row when it settles. */
export function analysisChainOutstanding(eventId: string): boolean {
  return analysisChains.has(eventId);
}
