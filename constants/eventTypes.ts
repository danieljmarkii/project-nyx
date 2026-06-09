import {
  UtensilsCrossed,
  Wind,
  Circle,
  CircleDashed,
  Moon,
  PawPrint,
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
// of change. (Durable fix tracked as B-075.)
//
// GI glyphs re-chosen 2026-06-09 (PM design review). The prior Droplet (vomit) /
// Droplets (loose stool) read as *blood drops* once tinted rose — the exact
// alarm the "calm, never alarmist" principle forbids (design-principles §Tone).
// Replacements, all non-fluid and better-centered in their box than the droplet
// pair (a teardrop is bottom-heavy; a ring is symmetric):
//   • vomit       → Wind         — abstract "queasy / unsettled", not a fluid drop.
//   • stool_normal→ Circle       — a formed, closed ring.
//   • diarrhea    → CircleDashed — the *broken* ring: formed vs. unformed reads
//                                  off the solid-vs-dashed contrast, a precise
//                                  clinical metaphor that needs no explanation.
// Every glyph here is always paired with a text label on screen, so the bar is
// calm + distinct + not-alarming, not literal self-evidence.
export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: UtensilsCrossed, hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: Wind,            hasSeverity: false, hasFood: false },
  diarrhea:     { label: 'Loose stool',  icon: CircleDashed,    hasSeverity: false, hasFood: false },
  stool_normal: { label: 'Stool',        icon: Circle,          hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: Moon,            hasSeverity: false, hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: PawPrint,        hasSeverity: false, hasFood: false },
  other:        { label: 'Other',        icon: Plus,            hasSeverity: false, hasFood: false },
} as const satisfies Record<string, { label: string; icon: LucideIcon; hasSeverity: boolean; hasFood: boolean }>;

// Severity (1–5 scale) removed from MVP — photos carry the clinical weight.
// The severity column remains in the schema; existing rows are preserved.
// skin_reaction, scratch, weight_check, medication are valid schema event_type values
// but not exposed in the MVP quick-log UI. May be added post-MVP.

export type EventTypeKey = keyof typeof EVENT_TYPES;

// The event types treated as symptoms (vs. meal / stool_normal / other). Drives
// the rose category tint on row surfaces. Shared here so EventRow and TodayZone
// can't drift to different definitions of "is this a symptom?".
export const SYMPTOM_TYPES: ReadonlySet<EventTypeKey> = new Set([
  'vomit', 'diarrhea', 'lethargy', 'itch',
]);
