import {
  UtensilsCrossed,
  BatteryLow,
  PawPrint,
  Pill,
  Scale,
  Ellipsis,
} from 'lucide-react-native';
import {
  VomitGlyph,
  StoolFormedGlyph,
  StoolLooseGlyph,
  type EventGlyph,
} from '../components/event/eventGlyphs';

// Event-type identity icons. The MVP emoji stand-ins (🍽 🤢 💩 😴 🐾 ➕) were
// replaced with Lucide stroke icons in design-system PR 3 (v1.2 "Linear Clean"),
// and the first three glyphs of the real Culprit family landed in B-745 PR 1.
//
// Two icon sources co-exist behind ONE render path (EventIcon,
// components/event/EventIcon.tsx), so this map stays the single point of change:
//   • The custom family (components/event/eventGlyphs.tsx) — the drawn marks that
//     name their subject. The GI glyphs (vomit/stool) were the weakest literal
//     matches in Lucide, so they were replaced first: the splat (vomit), the swirl
//     (formed stool) and its runny sibling (loose stool). B-746 commissions the
//     remaining six; the `icon` type is EventGlyph precisely so a custom and a
//     Lucide icon are interchangeable here.
//   • Lucide substitutes — for the types not yet in the family. lethargy is
//     BatteryLow (R2: Moon retired to the brand crescent) and other is Ellipsis
//     (Plus is reserved for add/create).
export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: UtensilsCrossed,  hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: VomitGlyph,       hasSeverity: false, hasFood: false },
  diarrhea:     { label: 'Loose stool',  icon: StoolLooseGlyph,  hasSeverity: false, hasFood: false },
  stool_normal: { label: 'Stool',        icon: StoolFormedGlyph, hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: BatteryLow,       hasSeverity: false, hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: PawPrint,         hasSeverity: false, hasFood: false },
  // Medication (B-117 PR 3). Not a symptom (stays out of SYMPTOM_TYPES, so no
  // rose category tint) and not food — it routes to its own MedicationPicker
  // step in app/log.tsx (like stool_normal's sub-step), never the food picker.
  // `medication` is already a live events.event_type enum value (migration 001);
  // this only exposes it in the quick-log UI.
  medication:   { label: 'Medication',   icon: Pill,             hasSeverity: false, hasFood: false },
  // Weight (B-186). Not a symptom (stays out of SYMPTOM_TYPES — no rose tint) and
  // not food: it routes to its own numeric `weight` sub-step in app/log.tsx (like
  // stool_normal/medication), and the measured value lands in the weight_checks
  // child (migration 024). `weight_check` is already a live events.event_type enum
  // value (migration 001); this exposes it in the quick-log UI for the first time.
  weight_check: { label: 'Weight',        icon: Scale,           hasSeverity: false, hasFood: false },
  other:        { label: 'Other',        icon: Ellipsis,         hasSeverity: false, hasFood: false },
} as const satisfies Record<string, { label: string; icon: EventGlyph; hasSeverity: boolean; hasFood: boolean }>;

// Severity (1–5 scale) removed from MVP — photos carry the clinical weight.
// The severity column remains in the schema; existing rows are preserved.
// skin_reaction, scratch are valid schema event_type values but not exposed in
// the MVP quick-log UI. May be added post-MVP. (weight_check is now exposed — B-186.)

export type EventTypeKey = keyof typeof EVENT_TYPES;

// The event types treated as symptoms (vs. meal / stool_normal / other). Drives
// the rose category tint on row surfaces. Shared here so EventRow and TodayZone
// can't drift to different definitions of "is this a symptom?".
export const SYMPTOM_TYPES: ReadonlySet<EventTypeKey> = new Set([
  'vomit', 'diarrhea', 'lethargy', 'itch',
]);
