// Presentation vocab for the editable stool structured fields (B-247 PR 6). The
// editor's chip rows and the read view's value labels share ONE ordered source
// here so they can't drift. Enum values must match migration 034 and the
// analyze-stool tool schema; the edit logic + types live in lib/analysis.ts.
//
// Bristol framing (spec §3.4, a Designer call): owners don't know the Bristol
// Stool Scale, so every consistency label leads with PLAIN LANGUAGE ("Soft and
// mushy"); the numeric Bristol type is a SECONDARY, small-print detail carried in
// `bristol` — surfaced quietly beside the plain label for the moment the owner
// relays it to a vet, never as the primary framing.
export interface StoolFieldOption {
  value: string;
  label: string;
  // Secondary clinical annotation shown small + muted next to the plain label
  // (consistency only). Absent on 'unsure' and on non-Bristol fields.
  bristol?: string;
}

// Bristol Stool Scale Type 1–7 (D3). Type 4 is the "normal" reference point; 1–2
// trend constipation, 5–7 trend loose/diarrhoeal. Plain-language labels track the
// analyze-stool tool-schema descriptions.
export const CONSISTENCY_OPTIONS: StoolFieldOption[] = [
  { value: 'type_1_hard_lumps', label: 'Hard lumps', bristol: 'Type 1' },
  { value: 'type_2_lumpy', label: 'Lumpy and firm', bristol: 'Type 2' },
  { value: 'type_3_cracked', label: 'Firm with cracks', bristol: 'Type 3' },
  { value: 'type_4_smooth_soft', label: 'Smooth and soft', bristol: 'Type 4' },
  { value: 'type_5_soft_blobs', label: 'Soft blobs', bristol: 'Type 5' },
  { value: 'type_6_mushy', label: 'Soft and mushy', bristol: 'Type 6' },
  { value: 'type_7_watery', label: 'Watery', bristol: 'Type 7' },
  { value: 'unsure', label: 'Unclear' },
];

export const COLOUR_OPTIONS: StoolFieldOption[] = [
  { value: 'brown', label: 'Brown' },
  { value: 'dark_brown', label: 'Dark brown' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'black_tarry', label: 'Black / tarry' },
  { value: 'grey_pale', label: 'Pale / grey' },
  { value: 'red_streaked', label: 'Red-streaked' },
  { value: 'unsure', label: 'Unclear' },
];

export const CONTENT_OPTIONS: StoolFieldOption[] = [
  { value: 'undigested_food', label: 'Undigested food' },
  { value: 'grass', label: 'Grass' },
  { value: 'hair', label: 'Hair' },
  { value: 'unsure', label: 'Unclear' },
];

// Blood presence is a tristate; the fresh-vs-tarry discriminator is a separate
// field (BLOOD_TYPE_OPTIONS), surfaced only when blood is present.
export const BLOOD_PRESENT_OPTIONS: StoolFieldOption[] = [
  { value: 'no', label: 'None visible' },
  { value: 'yes', label: 'Present' },
  { value: 'unsure', label: 'Unclear' },
];

export const BLOOD_TYPE_OPTIONS: StoolFieldOption[] = [
  { value: 'fresh_red', label: 'Fresh red' },
  { value: 'dark_tarry', label: 'Dark / tarry' },
];

export const MUCUS_OPTIONS: StoolFieldOption[] = [
  { value: 'no', label: 'None visible' },
  { value: 'yes', label: 'Present' },
  { value: 'unsure', label: 'Unclear' },
];

// yes / no / unsure for foreign-material presence.
export const TRISTATE_OPTIONS: StoolFieldOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Unclear' },
];

export function labelFor(
  options: StoolFieldOption[],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}

// The secondary Bristol annotation for a consistency value (null for 'unsure' or
// an unknown value) — kept beside labelFor so the read view can render the plain
// label prominently and the Bristol type quietly.
export function bristolFor(value: string | null | undefined): string | null {
  if (!value) return null;
  return CONSISTENCY_OPTIONS.find((o) => o.value === value)?.bristol ?? null;
}

// The owner-facing "Blood" observation value, combining the tristate presence with
// the fresh/tarry type. Blood is shown even when none is visible (clinically
// central, feeds the report) — distinct from the n=1 read's reassurance ban, which
// governs the read_text, not a factual structured observation.
export function bloodLabel(
  present: string | null | undefined,
  type: string | null | undefined,
): string | null {
  if (!present) return null;
  if (present === 'yes') {
    return labelFor(BLOOD_TYPE_OPTIONS, type) ?? 'Present';
  }
  if (present === 'no') return 'None visible';
  return 'Unclear';
}
