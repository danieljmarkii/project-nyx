// CUL-2712: every client write of food_items.photo_paths goes through here.
//
// A food's photos are one list, and three writers change it: the food page (add or
// replace a photo), the capture (the photos that landed, and the ones its queue did not
// take), and the photo queue's drain (lib/sync.ts). Each reads the list, edits it, and
// writes it back. Written blind, the last writer wins and a photo another writer added in
// the gap is dropped from the list (its object stays in Storage, named by nothing).
//
// So the write is a compare-and-set on the list the writer read, the same shape the
// drain uses: `.eq('photo_paths', <literal>)`. Zero rows back means the list moved (or the
// row is not this account's to write): read it again, rebuild from what is there, and try
// once more, a bounded number of times. A writer never needs to know who moved it.

import { supabase } from './supabase';
import { pgTextArrayLiteral } from './sync';
import { foodPathsWith } from './captureUploads';

/** How many compare-and-set rounds a write gets before it reports the list as contended. */
export const FOOD_PHOTO_LIST_ATTEMPTS = 3;

export type FoodPhotoListResult =
  | { ok: true; paths: string[] }
  | { ok: false; reason: 'error' | 'refused' | 'contended'; message: string };

type HeldRead = { ok: true; visible: boolean; held: string[] } | { ok: false; message: string };

async function readFoodPhotoList(foodId: string): Promise<HeldRead> {
  const res = await supabase.from('food_items').select('photo_paths').eq('id', foodId).maybeSingle();
  if (res.error) return { ok: false, message: res.error.message };
  const raw = (res.data as { photo_paths?: unknown[] | null } | null)?.photo_paths ?? [];
  // A NULL inside the array is read past, as the drain does: the compare-and-set then
  // never matches the real array, so the write reports contention rather than looping.
  return { ok: true, visible: res.data != null, held: raw.filter((p): p is string => typeof p === 'string') };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Write a food's photo list as `rebuild(held)`, where `held` is the list on the row.
 *
 * `read` is the list the caller already holds (the food page's, from when it loaded):
 * the first round compares against it, which is exactly the gap this exists to close.
 * Pass null to read the row first. `rebuild` must be pure: it runs again on each round.
 * A rebuild that changes nothing writes nothing.
 */
export async function writeFoodPhotoList(
  foodId: string,
  read: readonly string[] | null,
  rebuild: (held: readonly string[]) => string[],
): Promise<FoodPhotoListResult> {
  let held: readonly string[];
  if (read) {
    held = read;
  } else {
    const first = await readFoodPhotoList(foodId);
    if (!first.ok) return { ok: false, reason: 'error', message: first.message };
    held = first.held;
  }

  for (let attempt = 0; attempt < FOOD_PHOTO_LIST_ATTEMPTS; attempt += 1) {
    const next = rebuild(held);
    if (sameList(next, held)) return { ok: true, paths: next };
    const { data, error } = await supabase
      .from('food_items')
      .update({ photo_paths: next })
      .eq('id', foodId)
      .eq('photo_paths', pgTextArrayLiteral(held))
      .select('id');
    if (error) return { ok: false, reason: 'error', message: error.message };
    if (data && data.length > 0) return { ok: true, paths: next };

    // Zero rows: the list moved under us, or the update is not ours to make.
    const after = await readFoodPhotoList(foodId);
    if (!after.ok) return { ok: false, reason: 'error', message: after.message };
    if (!after.visible || sameList(after.held, held)) {
      // Not visible, or visible and unchanged: the update itself was refused.
      return { ok: false, reason: 'refused', message: 'photo list update matched no row' };
    }
    held = after.held;
  }
  return { ok: false, reason: 'contended', message: 'photo list kept changing' };
}

/**
 * The food page's edit: the slot's photo replaced by `path`, or `path` added when the
 * slot holds none (an `additional` photo is always added). A slot's photo is found by its
 * `-{slot}.jpg` suffix, so a queued capture photo (`{foodId}/0-q….-front.jpg`) that landed
 * while the page was open is the one an owner's replace takes over.
 */
export function foodPathsWithSlot(held: readonly string[], slot: string, path: string): string[] {
  const suffix = slot === 'additional' ? null : `-${slot}.jpg`;
  const existingIdx = suffix ? held.findIndex((p) => p.endsWith(suffix)) : -1;
  const next = [...held];
  if (existingIdx >= 0) next[existingIdx] = path;
  else next.push(path);
  return next;
}

/** The capture's edit: every path in `paths` the list does not hold yet, in slot order. */
export function foodPathsMerged(held: readonly string[], paths: readonly string[]): string[] {
  return paths.reduce<string[]>((acc, p) => (acc.includes(p) ? acc : foodPathsWith(acc, p)), [...held]);
}
