import { theme } from '../../../constants/theme';
import type { EventTintCategory } from '../../../lib/dayEvents';

/** The white chip each drill-in row's glyph sits on (`styles.rowIcon`). A pure module, so
 *  the contrast test can import it and measure the tints below against the ground they are actually drawn on. */
export const DAY_ROW_ICON_GROUND = theme.colorSurface;

// The drill-in's category tint: symptom rose, meal teal, medication slate; weight and a
// look neutral — a look's identity is "the owner answered", never a category hue of its
// own. A glyph is a NON-TEXT mark, so each clears 3:1 on `DAY_ROW_ICON_GROUND`; the meal
// glyph takes `colorAccentGlyph` (3.27:1), since the bright `colorEventMeal` is 2.26:1 on
// white (CUL-1659, the CUL-1637 fix on the log sheet's tiles).
export const DAY_ROW_TINT: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptom,
  meal: theme.colorAccentGlyph,
  medication: theme.colorEventMedication,
  other: theme.colorTextSecondary,
  look: theme.colorTextSecondary,
};
