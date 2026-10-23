// Food detail's "In mixed bowls" section (Mixed meals, CUL-2085; spec
// docs/nyx-mixed-meals-requirements.md §7.4, second bullet).
//
// A mix is never a library item (§7.4), so a food's mixes are read from the pet's bowls,
// not stored on the food. This is the pure half: which bowls held this food, grouped by
// what it was mixed with, newest first. It reads the SAME bowls the Foods tab's
// "· 8 in a mix" note counts (`mixedBowlFoodKeys`, `lib/db.ts`), so the lines here always
// sum to that note's number.
//
// Recency and a count, never a rate: a bowl here says nothing about how the pet took the
// food (§5.4 keeps mixes out of every rate), so no line carries an intake word.

import { componentLibraryKey, mixedBowlFoodKeys, type MixedBowlAt } from './db';
import { historyDayLabel } from './historyDateFilter';
import { componentDisplayName, type AppBowlComponent } from './mealBowls';
import { toLocalDayKey } from './utils';

/** One "8 bowls with Rabbit Pâté · last Oct 22" line. */
export interface FoodMixLine {
  /** Stable list key: the partner set's identity. */
  key: string;
  bowlCount: number;
  /** What the food was mixed with, from the newest bowl in the group; [] when the other
   *  food was not recorded (an incomplete bowl). */
  partnerNames: string[];
  /** The newest bowl's LOCAL day: the day History's door lands on. */
  lastDayKey: string;
  text: string;
  accessibilityLabel: string;
}

/** A component's library identity: the case-folded brand+product the Foods tab groups on
 *  (so a duplicate capture of one bag is one food), else the component's own key. */
function partnerKey(c: AppBowlComponent): string {
  return componentLibraryKey(c) ?? `component:${c.foodKey}`;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The day as History's pill prints it, with the year once it is not this year's: a
 *  year-less date is only safe inside a bounded range (C-19), and this one is not. */
function lastDayText(dayKey: string, nowMs: number): string {
  const label = historyDayLabel(dayKey);
  return dayKey.slice(0, 4) === toLocalDayKey(new Date(nowMs)).slice(0, 4) ? label : `${label}, ${dayKey.slice(0, 4)}`;
}

/**
 * The section's lines for one library food (`foodKey` = `foodIntakeKey(brand, product)`),
 * over one pet's bowls. Empty when the food was never mixed: the section is then absent,
 * never an empty heading (§7.4 "only when the food has been mixed").
 */
export function foodMixLines(
  foodKey: string,
  bowls: readonly MixedBowlAt[],
  nowMs: number = Date.now(),
): FoodMixLine[] {
  const groups = new Map<string, { count: number; lastMs: number; lastAt: string; names: string[] }>();
  for (const { occurredAt, bowl } of bowls) {
    if (!mixedBowlFoodKeys(bowl).has(foodKey)) continue;
    const partners = new Map<string, string>();
    for (const c of bowl.components) {
      const k = partnerKey(c);
      if (k === foodKey || partners.has(k)) continue;
      partners.set(k, componentDisplayName(c));
    }
    const key = [...partners.keys()].sort().join('\u001E');
    const ms = Date.parse(occurredAt);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { count: 1, lastMs: ms, lastAt: occurredAt, names: [...partners.values()] });
      continue;
    }
    g.count += 1;
    // Parsed, never compared as text (C-40); the newest bowl names the partners.
    if (ms > g.lastMs) Object.assign(g, { lastMs: ms, lastAt: occurredAt, names: [...partners.values()] });
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].lastMs - a[1].lastMs)
    .map(([key, g]) => {
      const lastDayKey = toLocalDayKey(new Date(g.lastAt));
      const day = lastDayText(lastDayKey, nowMs);
      const bowlsWord = g.count === 1 ? '1 bowl' : `${g.count} bowls`;
      const head = g.names.length > 0
        ? `${bowlsWord} with ${joinNames(g.names)}`
        : `${bowlsWord} with a food that wasn't recorded`;
      const text = `${head} · last ${day}`;
      return {
        key,
        bowlCount: g.count,
        partnerNames: g.names,
        lastDayKey,
        text,
        accessibilityLabel: `${head}, last on ${day}. Opens ${day} in History.`,
      };
    });
}
