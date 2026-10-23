// betaFeatures imports appConfig, whose supabase import fail-fasts on unset env in
// the jest runner — stub the client (the appConfig/useWidgetSnapshots convention).
// Only ALLOWLIST_FLAG_KEYS (a plain const) is read from that chain here.
jest.mock('./supabase', () => ({ supabase: {} }));

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BETA_REGISTRY,
  BETA_OPT_IN_STORAGE_KEY,
  deriveBetaShelf,
  parseBetaOptIns,
  serializeBetaOptIns,
  useBetaOptInStore,
  hydrateBetaOptIns,
  clearBetaOptIns,
  type BetaFeature,
} from './betaFeatures';
import {
  ALLOWLIST_FLAG_KEYS,
  ALLOWLIST_FLAGS_UNSET,
  type AllowlistFlagValues,
} from './appConfig';

// ── The registry (D7 §4.3.1) ──────────────────────────────────────────────────

describe('BETA_REGISTRY', () => {
  it('every entry is fully typed — the graduation policy has no silently-missing field', () => {
    for (const b of BETA_REGISTRY) {
      expect(typeof b.title).toBe('string');
      expect(b.title.length).toBeGreaterThan(0);
      expect(typeof b.blurb).toBe('string');
      expect(b.blurb.length).toBeGreaterThan(0);
      // owner + a review-by date are the "beta graveyard" teeth — an entry without
      // an accountable owner or a forcing date is the exact thing D7 exists to stop.
      expect(b.owner.length).toBeGreaterThan(0);
      expect(b.addedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof b.serverCost).toBe('boolean');
      // reviewBy is a forcing date, so it must be AFTER the add date.
      expect(new Date(b.reviewBy).getTime()).toBeGreaterThan(new Date(b.addedDate).getTime());
    }
  });

  it('keys on a real app_config allowlist flag, and never twice', () => {
    const keys = BETA_REGISTRY.map((b) => b.key);
    for (const k of keys) expect(ALLOWLIST_FLAG_KEYS).toContain(k);
    // One card = one flag = one opt-in key; a duplicate key would render two cards
    // for one toggle.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is empty at 1.2.0: the widget, the last beta, graduated (CUL-1842)', () => {
    // The two Signal betas (signal_design_v2 / signals_v2) graduated to GA and were
    // retired from the shelf (CUL-547 + CUL-548), the two capture betas (the log
    // screen redesign, B-745, and more event types, B-756) followed (CUL-962), and
    // then Vet visits, the appointment companion (CUL-905), Noticed, the daily look
    // (CUL-876), the diet trial's own screen (CUL-1307), History v2 (CUL-1175),
    // Design v2 (CUL-1071) and the Home Screen widget (CUL-1842, D8). The graduated
    // keys are out of the AllowlistFlagKey union, so the length is what pins it.
    expect(BETA_REGISTRY).toHaveLength(0);
    expect(ALLOWLIST_FLAG_KEYS as readonly string[]).not.toContain('widget_enabled');
  });
});

// ── deriveBetaShelf (B-747 — the OR over the registry) ────────────────────────
// The pure derivation both app/settings.tsx (the Beta row + "N on" count) and
// app/settings/beta.tsx (cards vs. the B-729 empty state) read through
// hooks/useBetaShelf. The headline contract is the B-747 regression: eligibility
// is an OR over EVERY registry key, never one hard-coded flag. The shipped registry
// is empty at 1.2.0 (CUL-1842), so these cases run over a fixture registry keyed on
// a real allowlist flag; the derivation is unchanged for whatever joins next.

describe('deriveBetaShelf (B-747)', () => {
  const gatedTo = (uid: string) => ({ enabled: false, allowlist: [uid] });
  const dark = { enabled: false, allowlist: [] };
  const allow = (over: Partial<AllowlistFlagValues>): AllowlistFlagValues => ({
    ...ALLOWLIST_FLAGS_UNSET,
    ...over,
  });
  const fixture = (key: BetaFeature['key']): BetaFeature => ({
    key,
    title: `Fixture ${key}`,
    blurb: 'A fixture beta.',
    owner: 'Test',
    addedDate: '2026-10-01',
    reviewBy: '2027-01-01',
    serverCost: false,
  });
  const REG = [fixture('ask_enabled'), fixture('ask_general_enabled')];

  it('the shipped (empty) registry gives every account no shelf (CUL-1842)', () => {
    expect(deriveBetaShelf(allow({ ask_enabled: { enabled: true, allowlist: [] } }), 'uid-1', {}).eligible).toEqual([]);
  });

  it('an eligible account gets the shelf, and eligibility turns nothing on', () => {
    const shelf = deriveBetaShelf(allow({ ask_enabled: gatedTo('uid-1') }), 'uid-1', {}, REG);
    expect(shelf.eligible.map((b) => b.key)).toEqual(['ask_enabled']);
    expect(shelf.activeCount).toBe(0); // eligible turns nothing on (Gate 2 untouched)
  });

  it('the unset baseline and a signed-out caller both yield no eligible betas (fail closed)', () => {
    expect(deriveBetaShelf(ALLOWLIST_FLAGS_UNSET, 'uid-1', {}, REG).eligible).toEqual([]);
    expect(
      deriveBetaShelf(allow({ ask_enabled: gatedTo('uid-1') }), null, {}, REG).eligible,
    ).toEqual([]);
  });

  it('activeCount counts only betas that are eligible AND opted in', () => {
    const allowlist = allow({ ask_enabled: gatedTo('uid-1') });
    expect(deriveBetaShelf(allowlist, 'uid-1', {}, REG).activeCount).toBe(0);
    expect(deriveBetaShelf(allowlist, 'uid-1', { ask_enabled: true }, REG).activeCount).toBe(1);
  });

  it('an opted-in but no-longer-eligible beta (a killed flag) is not counted as on', () => {
    // The feature has already stopped rendering for this account, so telling
    // the owner it's "on" would claim something the app isn't doing.
    const shelf = deriveBetaShelf(allow({ ask_enabled: dark }), 'uid-1', { ask_enabled: true }, REG);
    expect(shelf.eligible).toEqual([]);
    expect(shelf.activeCount).toBe(0);
  });

  it('enabled:true (a GA’d flag) is eligible for everyone, allowlist ignored', () => {
    const shelf = deriveBetaShelf(
      allow({ ask_enabled: { enabled: true, allowlist: [] } }),
      'anyone',
      {},
      REG,
    );
    expect(shelf.eligible.map((b) => b.key)).toEqual(['ask_enabled']);
  });

  it('eligible preserves registry order (the shelf renders in registry order)', () => {
    const everything = allow({ ask_enabled: gatedTo('uid-1'), ask_general_enabled: gatedTo('uid-1') });
    expect(deriveBetaShelf(everything, 'uid-1', {}, REG).eligible.map((b) => b.key)).toEqual(
      REG.map((b) => b.key),
    );
  });
});

// ── serverCost ⇒ a server-side gate too (D6 / §4.2) ───────────────────────────
// The widget, as a beta, gated client-only and that was correct. The STANDING rule
// is that any beta spending a server resource must ALSO re-check eligibility in its
// Edge Function (the client-only gate does not generalise). This test makes the
// rule grep-able: every serverCost:true entry's key must appear in the
// supabase/functions source. v1 has none, so the core loop is vacuous — but the
// positive control proves the scanner actually reads the functions, so the day a
// serverCost:true beta lands without a server gate, this fails instead of passing
// on an empty read.
function edgeFunctionSource(): string {
  const root = join(__dirname, '..', 'supabase', 'functions');
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
        parts.push(readFileSync(full, 'utf8'));
      }
    }
  };
  walk(root);
  return parts.join('\n');
}

describe('serverCost → a matching server-side gate (D6 / §4.2)', () => {
  const source = edgeFunctionSource();

  it('the scanner actually reads the Edge Functions (positive control: ask_enabled)', () => {
    // If this ever fails, the walk is reading nothing and the rule below is
    // vacuous — an allowlist-gated server flag we KNOW is enforced must be visible.
    expect(source).toContain('ask_enabled');
  });

  it('every serverCost:true beta is gated somewhere under supabase/functions', () => {
    const serverCostBetas = BETA_REGISTRY.filter((b) => b.serverCost);
    for (const b of serverCostBetas) {
      expect(source).toContain(b.key);
    }
    // Documents the v1 fact so a reader knows the loop above is intentionally empty
    // today, not accidentally skipped.
    if (serverCostBetas.length === 0) {
      expect(BETA_REGISTRY.every((b) => b.serverCost === false)).toBe(true);
    }
  });
});

// ── The opt-in store (Gate 2 / D4) ────────────────────────────────────────────

describe('parseBetaOptIns — tolerant decode', () => {
  it('absent / empty / garbage all decode to the unset baseline', () => {
    expect(parseBetaOptIns(null)).toEqual({});
    expect(parseBetaOptIns('')).toEqual({});
    expect(parseBetaOptIns('not json')).toEqual({});
    expect(parseBetaOptIns('42')).toEqual({});
    expect(parseBetaOptIns('null')).toEqual({});
  });

  it('keeps only known keys with real booleans (a tampered blob can inject nothing)', () => {
    const raw = JSON.stringify({
      engines_v3_en14: true,
      ask_enabled: false,
      widget_enabled: true, // the widget graduated; its persisted opt-in self-cleans (CUL-1842)
      not_a_flag: true, // unknown key — dropped
      design_v2: true, // a graduated beta's persisted opt-in self-cleans (CUL-1071)
      ask_general_enabled: 'yes', // non-boolean — dropped
    });
    expect(parseBetaOptIns(raw)).toEqual({ engines_v3_en14: true, ask_enabled: false });
  });

  it('round-trips through serialize', () => {
    const map = { ask_enabled: true };
    expect(parseBetaOptIns(serializeBetaOptIns(map))).toEqual(map);
  });
});

describe('useBetaOptInStore (Gate 2 / D4)', () => {
  beforeEach(async () => {
    useBetaOptInStore.getState().reset();
    await AsyncStorage.clear();
  });

  it('defaults every beta OFF — being eligible turns nothing on', () => {
    const { optIns } = useBetaOptInStore.getState();
    expect(optIns.ask_enabled ?? false).toBe(false);
  });

  it('setOptIn flips a key and persists it write-through', async () => {
    useBetaOptInStore.getState().setOptIn('ask_enabled', true);
    expect(useBetaOptInStore.getState().optIns.ask_enabled).toBe(true);

    // Write-through hit AsyncStorage (fire-and-forget, so let the microtask flush).
    await Promise.resolve();
    const persisted = parseBetaOptIns(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY));
    expect(persisted.ask_enabled).toBe(true);
  });

  it('setOptIn(false) turns it back off (reversible)', async () => {
    useBetaOptInStore.getState().setOptIn('ask_enabled', true);
    useBetaOptInStore.getState().setOptIn('ask_enabled', false);
    expect(useBetaOptInStore.getState().optIns.ask_enabled).toBe(false);
    await Promise.resolve();
    const persisted = parseBetaOptIns(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY));
    expect(persisted.ask_enabled).toBe(false);
  });

  it('hydrateBetaOptIns loads the persisted choice into the store', async () => {
    await AsyncStorage.setItem(
      BETA_OPT_IN_STORAGE_KEY,
      serializeBetaOptIns({ ask_enabled: true }),
    );
    expect(useBetaOptInStore.getState().hydrated).toBe(false);

    await hydrateBetaOptIns();

    expect(useBetaOptInStore.getState().optIns.ask_enabled).toBe(true);
    expect(useBetaOptInStore.getState().hydrated).toBe(true);
  });

  it('hydrateBetaOptIns with nothing stored leaves every beta off but marks hydrated', async () => {
    await hydrateBetaOptIns();
    expect(useBetaOptInStore.getState().optIns).toEqual({});
    expect(useBetaOptInStore.getState().hydrated).toBe(true);
  });

  it('a toggle set before hydration resolves is NOT clobbered by the stale on-disk value', async () => {
    // The warm-start race (code-review): eligibility can resolve from cache and
    // expose the toggle before the one-shot AsyncStorage read returns. Disk holds
    // the OLD value; the owner flips the NEW one first; hydration must not overwrite it.
    await AsyncStorage.setItem(
      BETA_OPT_IN_STORAGE_KEY,
      serializeBetaOptIns({ ask_enabled: true }), // stale on-disk value
    );
    useBetaOptInStore.getState().setOptIn('ask_enabled', false); // fresh intent, mid-flight

    useBetaOptInStore.getState().hydrateFrom({ ask_enabled: true }); // the stale read lands

    expect(useBetaOptInStore.getState().optIns.ask_enabled).toBe(false); // fresh intent wins
    expect(useBetaOptInStore.getState().hydrated).toBe(true);
  });

  it('clearBetaOptIns wipes memory AND the persisted key (sign-out parity)', async () => {
    useBetaOptInStore.getState().setOptIn('ask_enabled', true);
    await Promise.resolve();

    await clearBetaOptIns();

    expect(useBetaOptInStore.getState().optIns).toEqual({});
    expect(useBetaOptInStore.getState().hydrated).toBe(false);
    expect(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY)).toBeNull();
  });
});
