import { colorRoles, theme } from '../../../constants/theme';
import type { PriorityClass } from '../../../lib/signal';

/** The ground every Signal door's rail hangs against: the gutter of Home's one card
 *  (`HomeCard`, colorSurface). A pure module, so the contrast test measures the rails
 *  below on the ground they are actually drawn on (the `dayRowTint` precedent). */
export const SIGNAL_RAIL_GROUND = theme.colorSurface;

// One map for both doors (`SignalRow`, `SignalLeadCard`), which each kept their own copy.
// A rail is a NON-TEXT mark, so its drawn colour clears 3:1 on the ground. Safety keeps the
// rose at the 0.85 it always had (3.13:1 drawn): it may keep or raise its contrast, never
// lower it. An insight is a finding on the record, a good fact's register (the hue table,
// v2.1), so it takes the positive glyph at full strength: the bright teal at 0.85 drew
// 2.04:1, and the glyph teal at 0.85 would still draw 2.74:1 (CUL-1666).
export const SIGNAL_RAIL: Record<PriorityClass, { color: string; opacity: number }> = {
  safety: { color: theme.colorEventSymptom, opacity: 0.85 },
  insight: { color: colorRoles.positive.glyphOnLight, opacity: 1 },
};

/** The rail's style for a finding's class: its colour and the opacity it is drawn at. */
export function signalRailStyle(priorityClass: PriorityClass): { backgroundColor: string; opacity: number } {
  const { color, opacity } = SIGNAL_RAIL[priorityClass];
  return { backgroundColor: color, opacity };
}
