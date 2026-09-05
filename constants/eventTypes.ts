import {
  UtensilsCrossed,
  BatteryLow,
  PawPrint,
  Pill,
  Scale,
  Ellipsis,
  AudioLines,
  Wind,
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
//     remaining glyphs; the `icon` type is EventGlyph precisely so a custom and a
//     Lucide icon are interchangeable here.
//   • Lucide substitutes — for the types not yet in the family. lethargy is
//     BatteryLow (R2: Moon retired to the brand crescent), other is Ellipsis
//     (Plus is reserved for add/create), and the W1 respiratory pair are the
//     round-3-mock-drawn substitutes: cough = AudioLines, sneeze = Wind
//     (taxonomy checklist item 4 — B-746 commissions honest marks later).

/** A family is PRESENTATION metadata (taxonomy spec §3, D2): picker group, label,
 *  ordering. Never schema — the enum stays flat leaves. Moved here from
 *  EventTypePicker.tsx by W1-PR-2 (HR-4): the first wave that added leaf metadata
 *  is the one that owns the grouping, so later waves add a family by editing
 *  constants, not a component. */
export type EventFamilyKey =
  | 'digestion'
  | 'respiratory'
  | 'skinCoat'
  | 'energyBehavior'
  | 'measurements'
  | 'foodCare'
  | 'more';

/** §3 species conditionality: a leaf declares who it renders for; the grid filters
 *  by the active pet's `pets.species`. Copy-level splits (litter-box vs. house
 *  wording) stay in labels, never in keys (HR-23). Every W1 leaf is 'all'. */
export type EventSpecies = 'all' | 'cat' | 'dog';

/** D10 — the per-leaf confidence affordance.
 *  'artifact'  → discoverable after the fact: the capture surface offers the full
 *                Saw it / Found it window model (B-010/B-448).
 *  'witnessed' → witnessed-by-construction: there is nothing to "find", so the
 *                surface drops the chip pair and writes
 *                occurred_at_confidence = 'witnessed'; "Change time" covers late
 *                logging. A "Found it" on a cough would stamp a window claim the
 *                record cannot hold — the B-448 leak class, closed by construction.
 *  For the pre-W1 leaves this field DESCRIBES the shipped capture surface (it does
 *  not re-decide it): lethargy/itch keep the chip pair they ship with today —
 *  re-classing an existing leaf is its own wave's deliberate change, never a
 *  side-effect of adding a field. */
export type EventConfidenceModel = 'artifact' | 'witnessed';

interface EventTypeConfig {
  label: string;
  icon: EventGlyph;
  hasSeverity: boolean;
  hasFood: boolean;
  /** Presentation family (§3). Diarrhea shares digestion with stool_normal — it
   *  renders as the split Stool tile's "Loose" segment, never its own tile. */
  family: EventFamilyKey;
  species: EventSpecies;
  /** §6/§7 — photo affordance is per-leaf: a leaf with `hasPhoto: false` never
   *  renders a photo zone at capture nor an empty Add-photo hero on its detail
   *  screen (a photo already on a row still renders — suppression is of the BEG,
   *  never the evidence). For pre-W1 leaves this describes the shipped surfaces:
   *  meal is false (its clinical artifact is the food name — never beg; food
   *  photos belong to the food pipeline), everything else offers the detail
   *  add-photo hero today, medication/weight included. Only cough/sneeze are
   *  false by the §6 rule (no visual evidence). */
  hasPhoto: boolean;
  confidenceModel: EventConfidenceModel;
  /** §12 FL-1 — the event_types_v2 exposure gate. `true` marks a leaf whose GRID
   *  TILE exists only on the expanded (flag-on) grouped grid. EVENT_TYPES itself
   *  is NEVER flag-gated: it is the shared record vocabulary (labels, glyphs,
   *  tint) and must be complete on every device that can READ a row — a
   *  household's flag-off device renders a beta device's cough rows fully labeled
   *  and rose-tinted, by design (§8/§12). Only capture is gated. */
  v2Only: boolean;
}

export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: UtensilsCrossed,  hasSeverity: false, hasFood: true,  family: 'foodCare',       species: 'all', hasPhoto: false, confidenceModel: 'witnessed', v2Only: false },
  vomit:        { label: 'Vomit',        icon: VomitGlyph,       hasSeverity: false, hasFood: false, family: 'digestion',      species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
  diarrhea:     { label: 'Loose stool',  icon: StoolLooseGlyph,  hasSeverity: false, hasFood: false, family: 'digestion',      species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
  stool_normal: { label: 'Stool',        icon: StoolFormedGlyph, hasSeverity: false, hasFood: false, family: 'digestion',      species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
  // W1 (taxonomy spec §13a, CUL-675) — the respiratory pair, dark behind
  // event_types_v2 (v2Only gates the TILE, never the vocabulary). Both are
  // witnessed-by-construction (D10): a cough is heard, never found later, so
  // there is no Saw it / Found it and no photo zone (hasPhoto false). Rendered
  // directly under Digestion per the confirmed round-3 W1 frame.
  cough:        { label: 'Cough',        icon: AudioLines,       hasSeverity: false, hasFood: false, family: 'respiratory',    species: 'all', hasPhoto: false, confidenceModel: 'witnessed', v2Only: true  },
  sneeze:       { label: 'Sneeze',       icon: Wind,             hasSeverity: false, hasFood: false, family: 'respiratory',    species: 'all', hasPhoto: false, confidenceModel: 'witnessed', v2Only: true  },
  lethargy:     { label: 'Lethargy',     icon: BatteryLow,       hasSeverity: false, hasFood: false, family: 'energyBehavior', species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
  itch:         { label: 'Itch/Scratch', icon: PawPrint,         hasSeverity: false, hasFood: false, family: 'skinCoat',       species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
  // Medication (B-117 PR 3). Not a symptom (stays out of SYMPTOM_TYPES, so no
  // rose category tint) and not food — it routes to its own MedicationPicker
  // step in app/log.tsx (like stool_normal's sub-step), never the food picker.
  // `medication` is already a live events.event_type enum value (migration 001);
  // this only exposes it in the quick-log UI.
  medication:   { label: 'Medication',   icon: Pill,             hasSeverity: false, hasFood: false, family: 'foodCare',       species: 'all', hasPhoto: true,  confidenceModel: 'witnessed', v2Only: false },
  // Weight (B-186). Not a symptom (stays out of SYMPTOM_TYPES — no rose tint) and
  // not food: it routes to its own numeric `weight` sub-step in app/log.tsx (like
  // stool_normal/medication), and the measured value lands in the weight_checks
  // child (migration 024). `weight_check` is already a live events.event_type enum
  // value (migration 001); this exposes it in the quick-log UI for the first time.
  weight_check: { label: 'Weight',        icon: Scale,           hasSeverity: false, hasFood: false, family: 'measurements',   species: 'all', hasPhoto: true,  confidenceModel: 'witnessed', v2Only: false },
  other:        { label: 'Other',        icon: Ellipsis,         hasSeverity: false, hasFood: false, family: 'more',           species: 'all', hasPhoto: true,  confidenceModel: 'artifact',  v2Only: false },
} as const satisfies Record<string, EventTypeConfig>;

// Severity (1–5 scale) removed from MVP — photos carry the clinical weight.
// The severity column remains in the schema; existing rows are preserved.
// skin_reaction, scratch are valid schema event_type values but not exposed in
// the quick-log UI: skin_reaction ships at W3; scratch stays dormant permanently
// (D13 — `itch` is the one key and tile for the itch/scratch owner-observable).

export type EventTypeKey = keyof typeof EVENT_TYPES;

// ── §8 read-surface degradation contract (taxonomy spec; verified per wave) ──
// An event_type value can reach a build that does not know it — an un-updated
// device on the same account (reads are never flag-gated, §12) or a future wave's
// leaf on this build. The contract, verified by the membership test and HR-9's
// audit: every label sink degrades to the raw key or a generic noun (EventIcon →
// CircleHelp; detail/day rows → 'Event'; day-summary nouns → the lowercased
// label), nothing crashes — and an unknown SYMPTOM renders neutral-not-rose
// (§8a: SYMPTOM_TYPES categorization can't see it), which silently softens the
// record. That de-symptomization is the accepted, documented cost of ungated
// reads at release cadence — it is why the §11 swap script gates on every device
// carrying this build (step 0), and why W1-PR-3a ships the client mirrors before
// the engine learns cough (HR-2).

// The event types treated as symptoms (vs. meal / stool_normal / other). Drives
// the rose category tint on row surfaces AND the soft-impact commit haptic (a
// symptom commit is acknowledged, never congratulated). Shared here so EventRow,
// TodayZone and the log surfaces can't drift to different definitions of "is this
// a symptom?". §6 pairing rule: a new symptom leaf joins this AND the picker's
// CATEGORY_TINT in the same PR; stool_normal remains the one documented
// divergence (rose-tinted, never symptom-haptic'd — a normal stool is the good
// day in a diet trial). W1 adds cough + sneeze (CUL-675).
export const SYMPTOM_TYPES: ReadonlySet<EventTypeKey> = new Set([
  'vomit', 'diarrhea', 'lethargy', 'itch', 'cough', 'sneeze',
]);

// ── The per-incident read's scope (CUL-802) ──────────────────────────────────

/** The two owner-classified stool event types. They share the analyze-stool read
 *  (the diet-trial split between "formed" and "loose" is an owner judgement about
 *  the same artifact), so every gate that asks "is this a stool?" asks it here. */
export function isStoolEvent(type: string | null | undefined): boolean {
  return type === 'stool_normal' || type === 'diarrhea';
}

/** Does a photo of THIS event type get a per-incident AI read?
 *
 *  One predicate, four consumers: the write side (lib/simpleEvent decides whether
 *  to claim the analysis chain and which analyze-* function to invoke), the detail
 *  screen (whether to render a read section at all), and — since CUL-802 — the two
 *  log entry points, which route a photographed incident to its record instead of
 *  back to Home. That routing rule is "the logs with a read to show" (spec D2), so
 *  it must be the SAME question the write side answers, not a second list that
 *  agrees today: a leaf added to one and not the other either routes an owner to a
 *  screen with nothing on it, or writes a read nobody is shown.
 *
 *  Takes `string` rather than EventTypeKey because the callers hold a DB
 *  event_type: the row is the authority, and an unrecognised value is simply not
 *  readable (never a throw on a screen the owner is already looking at). */
export function hasPerIncidentRead(type: string | null | undefined): boolean {
  return type === 'vomit' || isStoolEvent(type);
}

// ── The family groups (presentation, §3) ─────────────────────────────────────

/** Family display order + owner-facing labels for the EXPANDED (event_types_v2)
 *  grid — the confirmed round-3 W1 frame, which is the W1-PR-2 design authority:
 *  symptom families lead (B-745 R1), Breathing sits directly under Digestion, and
 *  Other closes the grid alone under More (never a sibling of Meal). The GI group
 *  is "Digestion" — never "Tummy" (P3); the respiratory family renders as
 *  "Breathing" (owner language, §3 naming rule). */
export const EVENT_FAMILIES: readonly { key: EventFamilyKey; label: string }[] = [
  { key: 'digestion', label: 'Digestion' },
  { key: 'respiratory', label: 'Breathing' },
  { key: 'skinCoat', label: 'Skin & coat' },
  { key: 'energyBehavior', label: 'Energy & behavior' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'foodCare', label: 'Food & care' },
  { key: 'more', label: 'More' },
];

export interface PickerGroup<K extends string = EventTypeKey> {
  label: string;
  keys: K[];
}

/** The minimal per-entry shape the grid derivation reads — parameterized so the
 *  species mechanism is testable against hypothetical species-conditional leaves
 *  (every W1 leaf is 'all', so the real map can't exercise the filter). */
interface PickerEntryShape {
  family: EventFamilyKey;
  species: EventSpecies;
}

/** The expanded grid's groups, derived from the constants (never hand-listed in a
 *  component): EVENT_FAMILIES order × entry declaration order (which encodes
 *  within-family matrix rank, §6), filtered to the active pet's species.
 *
 *  Rules carried here so every wave inherits them:
 *  • `diarrhea` is never a tile — it is the split Stool tile's "Loose" segment
 *    (the same filter the flat grid applies).
 *  • Species: an entry renders when it is 'all' or matches the pet; a species
 *    outside dog/cat (or unknown) renders the 'all' set only (§3).
 *  • A family with no visible entries renders no header (a cat never sees a
 *    dog-only family's empty group). */
export function expandedPickerGroups<K extends string>(
  species: string | null | undefined,
  entries: Record<K, PickerEntryShape>,
): PickerGroup<K>[] {
  const petSpecies = species === 'cat' || species === 'dog' ? species : null;
  const keys = Object.keys(entries) as K[];
  return EVENT_FAMILIES.flatMap((family) => {
    const familyKeys = keys.filter((key) => {
      if (key === 'diarrhea') return false;
      const entry = entries[key];
      if (entry.family !== family.key) return false;
      return entry.species === 'all' || entry.species === petSpecies;
    });
    return familyKeys.length > 0 ? [{ label: family.label, keys: familyKeys }] : [];
  });
}
