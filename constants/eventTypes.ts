import {
  UtensilsCrossed,
  Droplet,
  Droplets,
  Circle,
  Moon,
  PawPrint,
  Pill,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';

// Event-type identity icons. The MVP emoji stand-ins (🍽 🤢 💩 😴 🐾 ➕) were
// replaced with Lucide stroke icons in design-system PR 3 (v1.2 "Linear Clean").
//
// Lucide is a SUBSTITUTE set, NOT the Nyx product icon family (design-system
// README §Iconography). When a custom 6–8 glyph family is commissioned, swap
// the `icon` refs here — every render site reads through the EventIcon
// component (components/event/EventIcon.tsx), so this map is the single point
// of change. The GI glyphs (vomit/stool) are the weakest literal matches in
// Lucide and were chosen for visual distinctness + clinical calm over literal
// fidelity: Droplet (vomit) vs Droplets (loose stool) vs Circle (formed stool).
export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: UtensilsCrossed, hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: Droplet,         hasSeverity: false, hasFood: false },
  diarrhea:     { label: 'Loose stool',  icon: Droplets,        hasSeverity: false, hasFood: false },
  stool_normal: { label: 'Stool',        icon: Circle,          hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: Moon,            hasSeverity: false, hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: PawPrint,        hasSeverity: false, hasFood: false },
  // Medication (B-117 PR 3). Not a symptom (stays out of SYMPTOM_TYPES, so no
  // rose category tint) and not food — it routes to its own MedicationPicker
  // step in app/log.tsx (like stool_normal's sub-step), never the food picker.
  // `medication` is already a live events.event_type enum value (migration 001);
  // this only exposes it in the quick-log UI.
  medication:   { label: 'Medication',   icon: Pill,            hasSeverity: false, hasFood: false },
  other:        { label: 'Other',        icon: Plus,            hasSeverity: false, hasFood: false },
} as const satisfies Record<string, { label: string; icon: LucideIcon; hasSeverity: boolean; hasFood: boolean }>;

// Severity (1–5 scale) removed from MVP — photos carry the clinical weight.
// The severity column remains in the schema; existing rows are preserved.
// skin_reaction, scratch, weight_check are valid schema event_type values
// but not exposed in the MVP quick-log UI. May be added post-MVP.

export type EventTypeKey = keyof typeof EVENT_TYPES;

// The event types treated as symptoms (vs. meal / stool_normal / other). Drives
// the rose category tint on row surfaces. Shared here so EventRow and TodayZone
// can't drift to different definitions of "is this a symptom?".
export const SYMPTOM_TYPES: ReadonlySet<EventTypeKey> = new Set([
  'vomit', 'diarrhea', 'lethargy', 'itch',
]);
