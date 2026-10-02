// Which image a Signal-screen episode tile shows (CUL-1269). Pure, so the fallback
// order is unit-testable without mounting the gallery.
//
// The record screen already serves the same photo safely (`lib/eventPhoto.ts`, B-207):
// the on-device file when it is really there, else a small signed transform, else the
// raw original when the transform cannot load. The gallery shipped with none of that —
// it trusted a stale cache path, never fell back from a failed transform, and swallowed
// a failed signing — so a photo the record shows fine rendered as an empty grey square.
// An empty square under a date reads as "nothing here"; this module never lets a tile
// end there silently: every path ends at a photo or at `failed`, which the tile says.

/** One source slot. `undefined` = still being signed; `null` = unavailable. */
export type TileSource = string | null | undefined;

export interface TilePhotoSources {
  /** The on-device file, only when it still exists (`localFileExists`). */
  local: string | null;
  /** The 320px signed transform. */
  transform: TileSource;
  /** The raw signed original — the fallback when the transform cannot load. */
  raw: TileSource;
}

export type TilePhotoState = { kind: 'loading' } | { kind: 'photo'; uri: string } | { kind: 'failed' };

/**
 * The first source, in preference order, that has not failed to load. A slot still
 * being signed holds the tile at `loading` rather than skipping ahead: the raw original
 * is tens of times the transform's size, so it is fetched only when the transform has
 * actually failed, never because it happened to sign first.
 */
export function resolveTilePhoto(sources: TilePhotoSources, failed: ReadonlySet<string>): TilePhotoState {
  for (const candidate of [sources.local, sources.transform, sources.raw]) {
    if (candidate === undefined) return { kind: 'loading' };
    if (candidate === null || failed.has(candidate)) continue;
    return { kind: 'photo', uri: candidate };
  }
  return { kind: 'failed' };
}

/** Whether the tile needs signed URLs: no usable local file, or the local file failed to load. */
export function tileNeedsRemote(local: string | null, failed: ReadonlySet<string>): boolean {
  return local === null || failed.has(local);
}

/** Said in the well when every source failed. The tile stays a door to its record. */
export const TILE_PHOTO_FAILED_LABEL = "Photo didn't load";
