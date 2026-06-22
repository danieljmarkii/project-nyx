// Presentation vocab for the editable vomit structured fields (B-028). The
// editor's chip rows and the read view's value labels share ONE ordered source
// here so they can't drift. Enum values must match migration 013 and the
// analyze-vomit tool schema; logic + types live in lib/analysis.ts.
export interface VomitFieldOption {
  value: string;
  label: string;
}

export const COLOUR_OPTIONS: VomitFieldOption[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'white', label: 'White' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'brown', label: 'Brown' },
  { value: 'tan', label: 'Tan' },
  { value: 'pink_red', label: 'Pink / red' },
  { value: 'dark_red', label: 'Dark red' },
  { value: 'black_coffee_ground', label: 'Black' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'unsure', label: 'Unclear' },
];

export const CONTENT_OPTIONS: VomitFieldOption[] = [
  { value: 'undigested_food', label: 'Undigested food' },
  { value: 'partially_digested_food', label: 'Partly digested food' },
  { value: 'bile', label: 'Bile' },
  { value: 'foam', label: 'Foam' },
  { value: 'liquid_only', label: 'Liquid' },
  { value: 'grass_or_plant', label: 'Grass / plant' },
  { value: 'hair', label: 'Hair' },
  { value: 'unsure', label: 'Unclear' },
];

export const CONSISTENCY_OPTIONS: VomitFieldOption[] = [
  { value: 'watery', label: 'Watery' },
  { value: 'foamy', label: 'Foamy' },
  { value: 'mucoid_slimy', label: 'Slimy' },
  { value: 'soft_formed', label: 'Soft / formed' },
  { value: 'chunky', label: 'Chunky' },
  { value: 'unsure', label: 'Unclear' },
];

export const BLOOD_OPTIONS: VomitFieldOption[] = [
  { value: 'none_visible', label: 'None visible' },
  { value: 'fresh_red', label: 'Fresh red' },
  { value: 'coffee_ground', label: 'Dark / older blood' },
  { value: 'unsure', label: 'Unclear' },
];

// yes / no / unsure for foreign-material presence.
export const TRISTATE_OPTIONS: VomitFieldOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Unclear' },
];

export function labelFor(
  options: VomitFieldOption[],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}
