// Which widget pet taps have been spent, for every screen that reads one (HV-11 / CUL-1168;
// CUL-1119).
//
// `useWidgetPetLink` spends a tap ONCE: the pet a widget link names is selected on the tap,
// never again, so a later switch in the app sticks. It kept that memory in a ref, which is
// once per MOUNT, and the History tab mounts a different screen when `history_v2` flips
// (v1's screen or v2's). A flip after the owner had switched pets mounted a fresh hook over
// the same params, which selected the widget's pet again: CUL-1119's revert, one flip later.
//
// So a tap that carries a nonce (`ts`, which every History link carries) is remembered here,
// for the app's session, by every instance of the hook at once; and History's door can ask
// whether the widget's switch for a tap has already happened (`isWidgetPetTapSpent`) rather
// than wait for a pet the owner has since left. A tap without a nonce (the widget's log
// links, which are frozen and carry none) stays once per mount, in the hook's own ref:
// there is nothing to tell two such taps apart by.
//
// Not account state: a nonce names a tap, never a record, and a pet id outlives nothing the
// wipe owns. The set grows by one per widget tap for the life of the process.

const spent = new Set<string>();

function tapKey(petId: string, nonce: string): string {
  return `${petId}|${nonce}`;
}

/** Mark one widget tap (its pet and its nonce) as spent. */
export function spendWidgetPetTap(petId: string, nonce: string): void {
  spent.add(tapKey(petId, nonce));
}

/** Has this tap's pet already been applied (or refused) by some screen? */
export function isWidgetPetTapSpent(petId: string, nonce: string | undefined): boolean {
  return nonce !== undefined && nonce !== '' && spent.has(tapKey(petId, nonce));
}

/** Tests only: forget every tap (module state outlives a single test, not a test file). */
export function __resetWidgetPetTapsForTest(): void {
  spent.clear();
}
