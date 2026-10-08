import { router } from 'expo-router';

/**
 * The door from a completion card's floor line to the read it names (Engines v3 PR-28b,
 * CUL-1436). The card goes first, then the record opens. A card already over that record
 * (a photoless vomit's call now routes there, §6 item 2) only steps aside: pushing the
 * same record again would stack a second copy of the screen the owner is on.
 */
export function openRaisedRead(eventId: string, pathname: string, hide: () => void): void {
  hide();
  if (!eventId) return;
  const target = `/event/${eventId}`;
  if (pathname === target) return;
  router.push(target);
}
