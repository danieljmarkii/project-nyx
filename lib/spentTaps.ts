// Which taps on a link into History have been applied, for every screen that reads one
// (HV-11 / CUL-1168; CUL-1119, CUL-1164).
//
// A link is a one-shot request (C-22): a widget tap selects its pet once, and a door into
// History applies its filter, window or day once, so a later choice in the app sticks. Both
// kept that memory in a ref, which is once per MOUNT, and the History tab mounts a different
// screen when `history_v2` flips (v1's or v2's). A flip after the owner had switched pets
// mounted a fresh hook over the same params, which selected the widget's pet again
// (CUL-1119's revert, one flip later); a flip off and on again re-applied an old link over
// whatever the owner had chosen since. So a tap is remembered here, for the app's session,
// by every instance at once:
//
//   • the widget's pet, per (pet, nonce): `useWidgetPetLink`, for a tap that carries a nonce
//     (`ts`, which every History link carries). A tap without one (the widget's log links,
//     frozen and nonce-less) stays once per mount in the hook's own ref: there is nothing to
//     tell two such taps apart by. A tap naming a pet the account does not have is spent
//     too, with no switch: that pet is ignored, never waited for (`usePet` loads the list in
//     one step, so "not in the list" means gone, not "not yet").
//   • a History door, per `historyDoorTapKey` (the nonce and the request): `useHistoryDoor`.
//     It also asks whether the widget's switch for its tap has happened, so a link whose
//     switch is spent while the owner is on another pet is dropped rather than landing late.
//
// Pet ids rest in JS memory here, so the set is account state outside SQLite and
// `wipeLocalSession` clears it (FR-9 parity; the `clearTrialContextCache` precedent: pet ids
// are uuids, so the risk is not a collision but an identifier of the last account lingering).
// It grows by one per tap for the life of the process.

const widgetPetTaps = new Set<string>();
const historyDoorTaps = new Set<string>();

function widgetKey(petId: string, nonce: string): string {
  return `${petId}|${nonce}`;
}

/** Mark one widget tap (its pet and its nonce) as spent. */
export function spendWidgetPetTap(petId: string, nonce: string): void {
  widgetPetTaps.add(widgetKey(petId, nonce));
}

/** Has this tap's pet already been applied (or ignored) by some screen? */
export function isWidgetPetTapSpent(petId: string, nonce: string | undefined): boolean {
  return nonce !== undefined && nonce !== '' && widgetPetTaps.has(widgetKey(petId, nonce));
}

/** Mark one History door tap (`historyDoorTapKey`) as applied. */
export function spendHistoryDoorTap(tap: string): void {
  historyDoorTaps.add(tap);
}

export function isHistoryDoorTapSpent(tap: string): boolean {
  return historyDoorTaps.has(tap);
}

/** Forget every tap: sign-out (`wipeLocalSession`), and tests (module state outlives a test,
 *  not a test file). */
export function clearSpentTaps(): void {
  widgetPetTaps.clear();
  historyDoorTaps.clear();
}
