import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ALLOWLIST_FLAG_KEYS,
  resolveAllowlistFlag,
  type AllowlistFlagKey,
  type AllowlistFlagValues,
} from './appConfig';

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
    // Noticed — the daily look (Home v2 — the redesign / CUL-866). Joins the
    // shelf seed-first (spec §10 N-0): N-0 registers the flag + the shelf card
    // dark; the later Noticed PRs (N-4a the Home card, N-5 the Patterns card)
    // render behind `live = eligible && optedIn`, so being in the cohort turns
    // nothing on by itself. A rollout gate only — GA is every account (R1).
    key: 'daily_look',
    title: 'Noticed',
    // nyx-voice: concrete about what the owner gets — the ordinary days in the
    // record too — warm, no exclamation, and it doesn't oversell that it's
    // "new". It deliberately promises no insight: in v1 a look writes nothing
    // but itself (never enters the engine or a coverage line, spec §5), so the
    // blurb names the record it builds, not a pattern it finds.
    blurb:
      'A once-a-day note of how they seemed, right from Home — so the quiet days are in the record too, not only the ones something happened.',
    owner: 'Noticed / Home v2 (CUL-866) / Eng',
    addedDate: '2026-09-09',
    // ~1 quarter out — a forcing date for the graduate/kill/extend call, not a
    // timer that disables Noticed under the cohort.
    reviewBy: '2026-12-09',
    // Client-render-only (spec §10): Noticed's writes (the check_in/looks schema)
    // are account-agnostic and land for everyone; a look never enters the engine
    // or a coverage line, so no server resource is spent per opt-in and no server
    // gate is owed.
    serverCost: false,
  },
  {
    // Design v2 — the whole day (CUL-1062, D2-0). Joins the shelf seed-first:
    // D2-0 registers the flag + the shelf card dark + the flag-off guard; the
    // later lanes (D2-3 the Signal card + route, D2-4 Home on a real day, D2-5
    // the month on Patterns, D2-7 the waits) render behind
    // `live = eligible && optedIn` through hooks/useDesignV2.ts, so being in the
    // cohort turns nothing on by itself. A rollout gate only (PM, 2026-09-19:
    // "behind a beta toggle too") — GA is every account, and D2-8 retires the
    // row along with the old surfaces.
    key: 'design_v2',
    title: 'Design v2',
    // nyx-voice (PM-ruled verbatim on round 4): concrete about the three
    // surfaces the owner will notice, no exclamation, and it promises no
    // insight — a redesign draws the same record differently. The second
    // sentence is the flag-off guarantee said to the owner, and it is the
    // promise guards/designV2FlagOff.test.tsx keeps.
    blurb:
      'The new Home, the Signal’s own screen and the month on Patterns. Switch it off and the app is exactly as it was.',
    owner: 'Design v2 — the whole day / Design',
    addedDate: '2026-09-20',
    // ~1 quarter out — a forcing date for the graduate/kill/extend call, not a
    // timer that disables the redesign under the cohort. Graduation here is
    // D2-8 (GA), which waits on the PM's own device pass (D2-9), so the call on
    // this row may legitimately be "extend" until that pass has run.
    reviewBy: '2026-12-20',
    // Client-render-only: the redesign changes how Home, the Signal and
    // Patterns are DRAWN — the same rows, the same engine, the same report —
    // and no Edge Function reads the key, so no server resource is spent per
    // opt-in and no server gate is owed. The B-712 "server-cost betas gate
    // server-side" rule is checked and does not bite.
    serverCost: false,
  },
  // Five betas graduated to GA and were retired from the shelf. Two Signal betas first
  // (CUL-546 Phase 1 / CUL-547 + CUL-548): `signal_design_v2` (the Signal/Home design
  // uplift, B-721) and `signals_v2` (the "deeper signals" lanes, B-755); `signals_v2`'s
  // SERVER eligibility gate in generate-signal (B-777) is retired separately at GA-3.
  // Then the two capture betas together (CUL-960 / CUL-962): "Log screen redesign"
  // (B-745) and "More event types" (B-756), retired in one PR because the second's
  // grid was the first's grid expanded. Then "Vet visits" (the appointment companion,
  // CUL-898 → CUL-905), whose surfaces now render for every account. Removing a row
  // removes its shelf card; a persisted opt-in for any of the five keys self-cleans
  // (parseBetaOptIns keeps only known keys), so no storage migration is owed.
];

// ── The shelf derivation (B-747 — the OR over the registry) ───────────────────
// The one place "which betas can this account see, and how many are on" is
// computed. app/settings.tsx's Beta row and app/settings/beta.tsx's shelf both
// read this, so the row can never again gate on one hard-coded flag while the
// registry holds more (the B-747 bug: `widget_enabled` alone hid the shelf from
// an account allowlisted only for the log-picker redesign beta, B-745).
//
// Pure — no I/O, no hooks — so it unit-tests in plain jest and the hook wrapper
// (hooks/useBetaShelf.ts) can read each store in bulk ONCE and reduce here,
// instead of a per-entry hook call inside a BETA_REGISTRY.map() (rules-of-hooks).
//
// `activeCount` counts a beta only when it is eligible AND opted in: an
// opted-in-but-no-longer-eligible beta (a killed flag) is not "on" — its feature
// has already stopped rendering for that account — and counting it would tell the
// owner something the app isn't doing.
export interface BetaShelfState {
  /** Registry entries the caller is eligible for (Gate 1), in registry order. */
  eligible: BetaFeature[];
  /** Betas that are eligible (Gate 1) AND opted in (Gate 2) — the "N on" count. */
  activeCount: number;
}

export function deriveBetaShelf(
  allowlist: AllowlistFlagValues,
  userId: string | null,
  optIns: BetaOptInMap,
  registry: readonly BetaFeature[] = BETA_REGISTRY,
): BetaShelfState {
  // fallback=false — the same fail-closed convention as every allowlist gate: an
  // unset / unreachable / malformed value or a signed-out caller hides the beta.
  const eligible = registry.filter((b) => resolveAllowlistFlag(allowlist[b.key], userId, false));
  const activeCount = eligible.filter((b) => optIns[b.key] === true).length;
  return { eligible, activeCount };
}

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
