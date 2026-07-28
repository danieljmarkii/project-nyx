// Food-format display labels — the single source for turning a `food_items.format`
// enum value into something a person reads.
//
// This module is deliberately DEPENDENCY-FREE (no imports at all, `.ts`-resolvable)
// so both runtimes can share one copy: the app imports it via lib/food.ts, and the
// Deno Edge Functions import it directly as '../../../lib/foodFormat.ts'. The
// alternative — a second copy of the map inside supabase/functions — is exactly the
// drift that produced B-103, where `jerky` reached the enum and the pickers but not
// the label map and a jerky tile rendered its brand alone. One map, two runtimes.
//
// An unmapped value renders no label: 'other' is deliberately absent (an unspecified
// format has nothing honest to say) and a future enum addition degrades to a missing
// label rather than a raw SCREAMING_SNAKE token on screen or in a vet report.
export const FORMAT_LABEL: Record<string, string> = {
  dry_kibble: 'Dry',
  wet_canned: 'Wet',
  raw: 'Raw',
  freeze_dried: 'Freeze-dried',
  jerky: 'Jerky', // B-103: B-024 added jerky to the enum + pickers but missed this map (renders "… · JERKY")
  fresh_cooked: 'Fresh',
  human_food: 'Human food', // renders as "… · HUMAN FOOD" (B-102)
  topper: 'Topper',
  treat: 'Treat',
  // 'other' intentionally maps to '' — no chip when the format is unspecified.
};

// ── Event-surface format tag (B-556) ──────────────────────────────────────────
// The library surfaces (FoodTile / FoodRow / ArchivedFoodRow) have always rendered
// `BRAND · FORMAT`; the EVENT surfaces (Today, History, the calendar drill-in, the
// completion card, the vet report) rendered brand + product only. That dropped the
// one fact distinguishing two real rows: a prescription line stocked in both wet and
// dry is ONE brand + ONE product name, so both formats render as the same string and
// the owner cannot tell from the timeline which one the pet actually ate. Live case:
// "Royal Canin · Selected Protein PR" logged 4× wet and 4× dry across the same days.
//
// Wet-vs-dry is clinically material on its own — hydration, urinary and GI relevance,
// and under a diet trial the two are separately adherent — so this tag is shown on
// EVERY meal row, not only when two formats collide. Always-on is also the honest
// build: a collision-only rule would need each row to know the whole library, so a
// paginated row would change appearance as the library grew.
//
// Returns the UPPERCASE tag, or null when there is nothing honest to add:
//   • unspecified / unmapped format ('other', a future enum value) → null
//   • a tag that would merely echo the row's own label → null, so a treat-format
//     treat reads "Treat / Temptations · Tasty Chicken" and not "… TREAT" twice.
// Pure; callers render it as a fixed-width element (never appended to a truncating
// string — see EventRow, where the food name is flex:1 + numberOfLines={1} and a
// suffix would be the FIRST thing clipped on exactly the long names that need it).
export function foodFormatTag(
  format: string | null | undefined,
  rowLabel?: string | null,
): string | null {
  if (!format) return null;
  const label = FORMAT_LABEL[format];
  if (!label) return null;
  if (rowLabel && label.toLowerCase() === rowLabel.trim().toLowerCase()) return null;
  return label.toUpperCase();
}

// Title-case variant of the tag ("Dry", "Freeze-dried") for surfaces that read as a
// sentence rather than a scannable row — the completion card's "Logged · X (Dry)" and
// the vet report's "Royal Canin Selected Protein PR (Dry)". Same suppression rules.
export function foodFormatWord(
  format: string | null | undefined,
  rowLabel?: string | null,
): string | null {
  const tag = foodFormatTag(format, rowLabel);
  return tag ? FORMAT_LABEL[format as string] : null;
}
