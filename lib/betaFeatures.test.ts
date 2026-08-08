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
  parseBetaOptIns,
  serializeBetaOptIns,
  useBetaOptInStore,
  hydrateBetaOptIns,
  clearBetaOptIns,
  type BetaFeature,
} from './betaFeatures';
import { ALLOWLIST_FLAG_KEYS } from './appConfig';

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

  it('ships the widget as the only v1 beta, client-only (no server cost)', () => {
    const widget = BETA_REGISTRY.find((b) => b.key === 'widget_enabled');
    expect(widget).toBeDefined();
    expect((widget as BetaFeature).serverCost).toBe(false);
    expect(BETA_REGISTRY).toHaveLength(1);
  });
});

// ── serverCost ⇒ a server-side gate too (D6 / §4.2) ───────────────────────────
// The widget gates client-only and that's correct. The STANDING rule for beta #2+
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
      widget_enabled: true,
      ask_enabled: false,
      not_a_flag: true, // unknown key — dropped
      ask_general_enabled: 'yes', // non-boolean — dropped
    });
    expect(parseBetaOptIns(raw)).toEqual({ widget_enabled: true, ask_enabled: false });
  });

  it('round-trips through serialize', () => {
    const map = { widget_enabled: true };
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
    expect(optIns.widget_enabled ?? false).toBe(false);
  });

  it('setOptIn flips a key and persists it write-through', async () => {
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    expect(useBetaOptInStore.getState().optIns.widget_enabled).toBe(true);

    // Write-through hit AsyncStorage (fire-and-forget, so let the microtask flush).
    await Promise.resolve();
    const persisted = parseBetaOptIns(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY));
    expect(persisted.widget_enabled).toBe(true);
  });

  it('setOptIn(false) turns it back off (reversible)', async () => {
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    useBetaOptInStore.getState().setOptIn('widget_enabled', false);
    expect(useBetaOptInStore.getState().optIns.widget_enabled).toBe(false);
    await Promise.resolve();
    const persisted = parseBetaOptIns(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY));
    expect(persisted.widget_enabled).toBe(false);
  });

  it('hydrateBetaOptIns loads the persisted choice into the store', async () => {
    await AsyncStorage.setItem(
      BETA_OPT_IN_STORAGE_KEY,
      serializeBetaOptIns({ widget_enabled: true }),
    );
    expect(useBetaOptInStore.getState().hydrated).toBe(false);

    await hydrateBetaOptIns();

    expect(useBetaOptInStore.getState().optIns.widget_enabled).toBe(true);
    expect(useBetaOptInStore.getState().hydrated).toBe(true);
  });

  it('hydrateBetaOptIns with nothing stored leaves every beta off but marks hydrated', async () => {
    await hydrateBetaOptIns();
    expect(useBetaOptInStore.getState().optIns).toEqual({});
    expect(useBetaOptInStore.getState().hydrated).toBe(true);
  });

  it('clearBetaOptIns wipes memory AND the persisted key (sign-out parity)', async () => {
    useBetaOptInStore.getState().setOptIn('widget_enabled', true);
    await Promise.resolve();

    await clearBetaOptIns();

    expect(useBetaOptInStore.getState().optIns).toEqual({});
    expect(useBetaOptInStore.getState().hydrated).toBe(false);
    expect(await AsyncStorage.getItem(BETA_OPT_IN_STORAGE_KEY)).toBeNull();
  });
});
