export const EVENT_TYPES = {
  meal:         { label: 'Meal',         icon: 'bowl',    emoji: '🍽',  hasSeverity: false, hasFood: true  },
  vomit:        { label: 'Vomit',        icon: 'warning', emoji: '🤢',  hasSeverity: false, hasFood: false },
  diarrhea:     { label: 'Diarrhea',     icon: 'warning', emoji: '🟠',  hasSeverity: false, hasFood: false },
  stool_normal: { label: 'Stool',        icon: 'check',   emoji: '✓',  hasSeverity: false, hasFood: false },
  lethargy:     { label: 'Lethargy',     icon: 'sleep',   emoji: '😴',  hasSeverity: false, hasFood: false },
  itch:         { label: 'Itch/Scratch', icon: 'scratch', emoji: '🔴',  hasSeverity: false, hasFood: false },
  other:        { label: 'Other',        icon: 'plus',    emoji: '·',   hasSeverity: false, hasFood: false },
} as const;

// Severity (1–5 scale) removed from MVP — photos carry the clinical weight.
// The severity column remains in the schema; existing rows are preserved.
// skin_reaction, scratch, weight_check, medication are valid schema event_type values
// but not exposed in the MVP quick-log UI. May be added post-MVP.

export type EventTypeKey = keyof typeof EVENT_TYPES;
