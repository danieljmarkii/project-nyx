import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ALLOWLIST_FLAG_KEYS, type AllowlistFlagKey } from './appConfig';

// The Beta-features program (B-712, docs/nyx-beta-features-requirements.md). Two
// things live here, both deliberately UI-free so they unit-test in plain jest and
// so `useWidgetSnapshots` can read the opt-in without pulling a screen's import
// graph:
//   1. BETA_REGISTRY — the single source of truth for the shelf (D7 §4.3.1).
//   2. The opt-in store — Gate 2 (spec §2 / D4): a LOCAL, per-device preference,
//      default off, one boolean per beta key.
//
// TWO GATES, NEVER CONFLATED (spec §2). Eligibility (Gate 1) is the server-owned
// `app_config` allowlist, resolved in lib/appConfig.ts — it decides whether the
// shelf is even VISIBLE. Opt-in (Gate 2) is this store — it decides what's ON.
// Being eligible turns nothing on. Keeping the two apart is the whole reason the
// future Premium swap is one line (it moves Gate 1 only), so this file owns Gate 2
// and never touches eligibility.

// ── The registry (D7 §4.3.1) ──────────────────────────────────────────────────
// One typed row per beta, keyed on the `app_config` eligibility flag — which is
// ALSO the opt-in store key, so one key carries both gates. The page maps over the
// entries the caller is eligible for; the widget is the only entry in v1.
//
// The fields past key/title/blurb are the graduation policy's teeth — a small
// registry with a forcing date is the counter-force to the "beta graveyard" (a
// shipped-dark feature with no owner and no review date that accretes as debt):
//   • owner      — the persona / track accountable for the graduate-or-kill call.
//   • addedDate  — ISO, when it joined the shelf.
//   • reviewBy   — ISO, a REVIEW-BY date, NOT an auto-disable. On that date the
//                  owner makes an explicit graduate / kill / extend call. A beta
//                  past `reviewBy` with no decision is exactly what the periodic
//                  retro's beta-shelf audit (check #5) catches. Auto-killing a
//                  working feature out from under the cohort optimises tidiness
//                  over the owner's experience, which is backwards — so this forces
//                  a decision, it never silently pulls the feature.
//   • serverCost — true ⇒ the beta spends a server resource, so D6 / §4.2 REQUIRES
//                  a server-side gate too (the client-only gate does NOT generalise
//                  to a server feature). The widget publishes from the owner's own
//                  local data, so it is false. betaFeatures.test.ts asserts every
//                  serverCost:true entry has a matching server gate — the rule is
//                  grep-able, so beta #2 can't forget it.
export interface BetaFeature {
  key: AllowlistFlagKey;
  title: string;
  blurb: string;
  owner: string;
  addedDate: string;
  reviewBy: string;
  serverCost: boolean;
}

export const BETA_REGISTRY: BetaFeature[] = [
  {
    key: 'widget_enabled',
    title: 'Home screen widget',
    // nyx-voice (PR 4 voice pass): warm and concrete, no exclamation, and specific
    // — "today’s log", "what’s coming up" — rather than selling that it’s "new".
    blurb:
      'See today’s log and what’s coming up from your home screen, without opening Culprit.',
    owner: 'Widget track / Eng',
    addedDate: '2026-08-08',
    // ~1 quarter out. A forcing date for the graduate/kill/extend call, not a timer
    // that disables the widget under the cohort.
    reviewBy: '2026-11-08',
    // Client-only publish (spec §4.2 / D6): the widget reads the owner's own local
    // record and writes nothing server-side, so no server gate is owed.
    serverCost: false,
  },
  {
    // More-events / log-picker redesign (B-745) — joins the shelf per FL-2 (the
    // spec's "seed + shelf row land before any consumer" clause): PR 0 registers
    // the flag and the shelf card dark; PRs 1..3 render the redesign behind
    // `live = eligible && optedIn`, so being in the cohort no longer turns the new
    // picker on by itself.
    key: 'log_picker_v2',
    title: 'Log screen redesign',
    // nyx-voice: concrete about what the owner will notice (types grouped so they're
    // easy to find; simple events finish without a second screen), warm, no
    // exclamation, and it doesn't sell that it's "new".
    blurb:
      'A clearer way to log an event — the types grouped so what you need is easy to find, and simple ones finish without opening another screen.',
    owner: 'Log-picker redesign (B-745) / Design',
    addedDate: '2026-08-13',
    // ~1 quarter out — a forcing date for the graduate/kill/extend call, not a timer.
    reviewBy: '2026-11-13',
    // Zero server component (spec §1/§2): the redesign is presentation + step
    // structure only — same event writes, same sync paths — so no server resource is
    // spent per opt-in and no server gate is owed.
    serverCost: false,
  },
  // Two Signal betas graduated to GA and were retired from the shelf (CUL-546 Phase 1 /
  // CUL-547 + CUL-548): `signal_design_v2` (the Signal/Home design uplift, B-721) and
  // `signals_v2` (the "deeper signals" lanes, B-755). Removing the row removes the shelf
  // card; a persisted opt-in for either key self-cleans (parseBetaOptIns keeps only known
  // keys), so no storage migration is owed. `signals_v2`'s SERVER eligibility gate in
  // generate-signal (B-777) is retired separately at GA-3.
];

// ── The opt-in store (Gate 2 / D4) ────────────────────────────────────────────
// A local, per-device preference, default OFF, one boolean per beta key. Local-
// per-device is deliberate and MORE correct than a synced pref, not a shortcut: a
// home-screen widget is an inherently per-device object, so its opt-in belongs to
// the device (spec §4.3.2 — and mirroring it server-side would re-introduce exactly
// the health-data-adjacent consent boundary the measurement plan avoids).
//
// Persistence: write-through to AsyncStorage so the choice survives a relaunch;
// hydrated once at app start (hydrateBetaOptIns). WIPED on sign-out
// (clearBetaOptIns, called from wipeLocalSession) — account-adjacent device state
// must not leak the prior owner's beta choices to the next person on a shared
// device (CLAUDE.md wipe rule; same reasoning as the device-local active-pet
// selection).

// v1 key. Bump the suffix only on a breaking shape change (the parse tolerates a
// legacy blob → unset, so a bump is rarely needed).
export const BETA_OPT_IN_STORAGE_KEY = 'culprit.betaOptIns.v1';

// Absent key ⇒ off (the default). A partial map so a never-touched beta simply has
// no entry rather than an explicit false.
export type BetaOptInMap = Partial<Record<AllowlistFlagKey, boolean>>;

const KNOWN_KEYS = ALLOWLIST_FLAG_KEYS as readonly string[];

// Tolerant decode of the persisted blob → a clean map. Defensive like
// coerceAllowlistFlags: a garbage / legacy / partial blob can only ever yield the
// unset baseline ({}), and only KNOWN keys with a real boolean survive — so a
// tampered cache can't inject an unknown flag or a truthy non-boolean. Pure.
export function parseBetaOptIns(raw: string | null): BetaOptInMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const src = parsed as Record<string, unknown>;
  const out: BetaOptInMap = {};
  for (const key of KNOWN_KEYS) {
    const v = src[key];
    if (typeof v === 'boolean') out[key as AllowlistFlagKey] = v;
  }
  return out;
}

export function serializeBetaOptIns(map: BetaOptInMap): string {
  return JSON.stringify(map);
}

// Fire-and-forget write-through (petStore's persistActivePetId pattern): the
// in-memory store already drives this session, so a cache-write failure only costs
// the choice across a relaunch — never throw into a toggle handler.
function persistBetaOptIns(map: BetaOptInMap): void {
  AsyncStorage.setItem(BETA_OPT_IN_STORAGE_KEY, serializeBetaOptIns(map)).catch((e) => {
    console.warn('[betaFeatures] failed to persist opt-ins:', e);
  });
}

interface BetaOptInState {
  optIns: BetaOptInMap;
  /** True once the persisted value has been read (opt-ins render off until then). */
  hydrated: boolean;
  /** Flip one beta on/off; persists the whole map write-through. */
  setOptIn: (key: AllowlistFlagKey, on: boolean) => void;
  /** Merge the persisted map UNDER the current in-memory one; marks hydrated. Does NOT re-persist. */
  hydrateFrom: (map: BetaOptInMap) => void;
  /** Clear all opt-ins in memory (sign-out); the AsyncStorage key is removed separately. */
  reset: () => void;
}

export const useBetaOptInStore = create<BetaOptInState>((set) => ({
  optIns: {},
  hydrated: false,
  setOptIn: (key, on) =>
    set((state) => {
      const optIns = { ...state.optIns, [key]: on };
      persistBetaOptIns(optIns);
      return { optIns };
    }),
  hydrateFrom: (map) =>
    set((state) => ({
      // The persisted values load UNDER anything already set this session, so a
      // toggle flipped before this async read resolves is never clobbered by the
      // stale on-disk value (a warm-start race: eligibility can resolve from the
      // app_config cache and expose the toggle before one AsyncStorage read
      // returns). In-memory wins; untouched keys take the persisted value.
      optIns: { ...map, ...state.optIns },
      hydrated: true,
    })),
  reset: () => set({ optIns: {}, hydrated: false }),
}));

// Read one beta's opt-in for the current render (default off). Used by the beta
// page AND by useWidgetSnapshots — a primitive-boolean selector, so a subscriber
// only re-renders when THIS key's value changes.
export function useBetaOptIn(key: AllowlistFlagKey): boolean {
  return useBetaOptInStore((s) => s.optIns[key] ?? false);
}

// Load the persisted opt-ins into the store. Call once at app start (app/_layout).
// Until it resolves, every beta reads off — the safe default (a widget shows the
// neutral empty door rather than stale real data before we've confirmed opt-in).
// Best-effort: a read failure leaves the store at its default-off baseline.
export async function hydrateBetaOptIns(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY);
    useBetaOptInStore.getState().hydrateFrom(parseBetaOptIns(raw));
  } catch (e) {
    console.warn('[betaFeatures] failed to hydrate opt-ins:', e);
    // Mark hydrated so the UI leaves its loading assumption; the map stays {}.
    useBetaOptInStore.getState().hydrateFrom({});
  }
}

// Sign-out wipe (wipeLocalSession, FR-9 parity): drop the persisted opt-ins AND
// the in-memory copy, so the next account on this device starts with every beta
// off and inherits none of the prior owner's choices. Best-effort: never throws.
export async function clearBetaOptIns(): Promise<void> {
  useBetaOptInStore.getState().reset();
  try {
    await AsyncStorage.removeItem(BETA_OPT_IN_STORAGE_KEY);
  } catch (e) {
    console.warn('[betaFeatures] failed to clear opt-ins:', e);
  }
}
