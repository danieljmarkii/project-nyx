export const theme = {
  // Typography — final font choices TBD by designer
  fontBody: 'System',
  fontDisplay: 'System', // replace with warm serif/humanist sans when chosen
  fontWeightRegular: '400' as const,
  fontWeightMedium: '500' as const,

  // Colors — final values TBD by designer; never hardcode inline
  colorAccent: '#4A90A4',       // placeholder — interactive elements + trend line only
  colorNeutralDark: '#1A1A1A',  // placeholder
  colorNeutralLight: '#F5F5F3', // placeholder
  colorSurface: '#FFFFFF',
  colorTextPrimary: '#1A1A1A',
  colorTextSecondary: '#6B6B6B',
  colorBorder: '#E8E8E6',

  // Semantic colors for event types and trend charts
  colorEventSymptom: '#C97A6F',  // warm red — vomit, diarrhea, itch, lethargy
  colorChartEmpty: '#E8E8E6',    // unfilled bar / dot in trend chart

  // Spacing — 8pt grid
  space1: 8,
  space2: 16,
  space3: 24,
  space4: 32,
  space5: 48,
  space6: 64,

  // Border radius
  radiusSmall: 8,
  radiusMedium: 16,
  radiusLarge: 24,

  // Motion
  durationFast: 150,
  durationMedium: 250,
  easingDefault: 'ease-out',
} as const;
