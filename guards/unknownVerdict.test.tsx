// A verdict that does not exist yet, on every surface that reads one (CUL-1277).
//
// WHY THIS FILE. Engines v3 (EN-3, CUL-1133) will add verdicts to the per-incident read,
// and a server flag can keep them off an account but cannot keep them off a phone that
// is already installed. The 1.2.0 build is the first real owners hold, so every surface
// in it must meet a value it has never seen and do the safe thing: speak it as the
// escalation, in words (never a blank label), keep it on screen through a failed re-read
// (CUL-812), and never fold its facts. The rule lives in ONE list,
// `QUIET_VERDICTS` in `lib/incidentVerdict.ts`; this file checks every reader obeys it.
//
// WHAT "EVERY SURFACE" MEANS, AND HOW IT STAYS TRUE. `guards/readState.test.ts` already
// confines the verdict FIELD to a handful of client files; everything else sees it only
// through `readVerdictOf` / `isWorthACall`. So the surfaces are exactly the files whose
// code names `recommendation`, and the discovery half below scans for them: a new
// reader fails this suite until it is classified here, with a case, or excused with a
// reason. The scan and the behaviour cases are one file on purpose, so a registration
// sits next to its test. What the build ENFORCES is narrower than that, and stated so it
// does not read as coverage (C-38): a `components/` surface must have a row in the
// section table (the last test below), but a `lib/` entry in `SURFACES` and every
// `NOT_A_SURFACE` entry are exemptions a reviewer reads, with no structural check that a
// `describe` exercises them (C-32: the registry is an exemption, so each entry earns it).
//
// AND A STATUS IT DOES NOT KNOW (PM ruling 2026-09-26, option (a)). The adversarial pass
// found the same promise broken one column over: the record sections read `status` as a
// denylist, so a quiet verdict on a status nobody has defined yet stood as a calm read
// while History said the photo was not read. A quiet verdict now stands only on a
// finished read (`FINISHED_READ_STATUSES`, `lib/incidentReadState.ts`), the list
// `lib/readState.ts` reads too. An escalation on a status the build does not know still
// stands in the rose. (On the record, `capped` and `read_disabled` keep their own frames
// even over an escalation; the shipped server never writes either over one, and the
// one-line hardening is CUL-1326's.)
//
// THE FIXTURES. `call_now` is the likeliest real name (the critique's tier). The other
// can never be one, so a future PR that ships `call_now` for real leaves this file still
// testing an unknown value.
//
// The server half (the escalation guards in `_shared/incident-analysis.ts`) is pinned in
// Deno, in `supabase/functions/_shared/incident-analysis.test.ts`, under `CUL-1277`.
//
// STATED BLIND SPOTS (C-38): the scan is by name, so a verdict read through a computed
// key (`row['recommend' + 'ation']`) is invisible to it, as it is to the readState guard;
// `blankComments` does not understand JSX text, which fails toward a FALSE hit; and the
// scan is client-only, so a SERVER reader (Ask relays the value as-is, `ask/tools.ts`) is
// not here at all. The server's readers of a new value are EN-3's to enumerate (CUL-1133).

let mockRow: Record<string, unknown> | null = null;
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockRow, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
// Both sections' halves of lib/analysis, stubbed: a non-pending row never triggers a
// read, but the imports must resolve (the section suites' own mocks, merged).
jest.mock('../lib/analysis', () => ({
  triggerVomitAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  triggerStoolAnalysis: jest.fn(() => Promise.resolve({ error: null })),
  awaitAnalysisChain: jest.fn(() => Promise.resolve(false)),
  watchAnalysisRow: jest.fn(() => () => {}),
  saveVomitFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  saveStoolFieldEdits: jest.fn(() => Promise.resolve({ error: null })),
  deriveEditedFields: jest.fn(() => []),
  deriveEditedStoolFields: jest.fn(() => []),
  extractEditableFromPayload: jest.fn(() => null),
  extractStoolEditableFromPayload: jest.fn(() => null),
  normalizeVomitEdits: jest.fn((x: unknown) => x),
  normalizeStoolEdits: jest.fn((x: unknown) => x),
}));
jest.mock('../components/event/VomitFieldsEditor', () => ({ VomitFieldsEditor: () => null }));
jest.mock('../components/event/StoolFieldsEditor', () => ({ StoolFieldsEditor: () => null }));
jest.mock('../components/brand/WhorlSpinner', () => ({ WhorlSpinner: () => null }));

import * as fs from 'fs';
import * as path from 'path';
import type { ComponentType } from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { theme } from '../constants/theme';
import { OBSERVATION_FOLD_LABEL } from '../components/event/ObservationGrid';
import { StoolAnalysisSection } from '../components/event/StoolAnalysisSection';
import { VomitAnalysisSection } from '../components/event/VomitAnalysisSection';
import {
  escalationSurvivesFailure,
  FINISHED_READ_STATUSES,
  INCIDENT_REC_LABEL,
  incidentVerdictLabel,
  quietVerdictUnfinished,
} from '../lib/incidentReadState';
import { isEscalationVerdict, isQuietVerdict, QUIET_VERDICTS } from '../lib/incidentVerdict';
import { isWorthACall, readVerdictOf } from '../lib/readState';
import { blankComments } from './blankComments';

const ROOT = path.resolve(__dirname, '..');

const FUTURE = ['call_now', 'a_verdict_from_the_future'] as const;

/** Every status the pipeline writes, plus one it may write later. */
const STATUSES = ['completed', 'uncertain', 'failed', 'capped', 'read_disabled', 'pending', 'a_status_from_the_future'];

/** Statuses no build has been taught: a plausible future name, and one that can never be. */
const FUTURE_STATUSES = ['reading_again', 'a_status_from_the_future'] as const;

// ── The surfaces ─────────────────────────────────────────────────────────────

/**
 * The client files whose code names the verdict field, each with the reason it is one
 * and the `describe` below that renders a future verdict through it. Discovery (bottom
 * of the file) holds this map equal to what the tree actually contains.
 */
const SURFACES: Record<string, string> = {
  'components/event/VomitAnalysisSection.tsx': 'the record screen: the vomit read in words, its facts and its failure frame',
  'components/event/StoolAnalysisSection.tsx': 'the record screen: the stool twin',
  'lib/incidentReadState.ts': 'the CUL-812 rescue and the words, which both sections read',
  'lib/readState.ts': 'the predicate History, the month, Home’s spine and the Signal gallery draw through',
};

/** Files that name the field and decide nothing about it: storage, not a reader. */
const NOT_A_SURFACE: Record<string, string> = {
  'lib/readCopy.ts': 'the phone’s copy: stores and syncs the value verbatim, reads it through lib/readState.ts',
  'lib/localSchema.ts': 'DDL: declares the copy’s column',
};

// ── The two record sections ───────────────────────────────────────────────────

interface SectionCase {
  file: string;
  Section: ComponentType<{ eventId: string; petId: string; petName?: string | null; hasPhoto: boolean }>;
  /** A row with every column the section selects, set to empty. */
  empty: Record<string, unknown>;
  /** Structured facts that, on a quiet read, offer the fold: the non-vacuity half. */
  facts: Record<string, unknown>;
}

const SECTIONS: readonly SectionCase[] = [
  {
    file: 'components/event/VomitAnalysisSection.tsx',
    Section: VomitAnalysisSection,
    empty: {
      colour: null, contents: null, consistency: null, blood_present: null, bile_present: null,
    },
    facts: { colour: 'yellow', consistency: 'foamy', contents: ['bile'], blood_present: 'none_visible' },
  },
  {
    file: 'components/event/StoolAnalysisSection.tsx',
    Section: StoolAnalysisSection,
    empty: {
      stool_consistency: null, stool_colour: null, stool_content: null,
      stool_blood_present: null, stool_blood_type: null, stool_mucus_present: null,
    },
    facts: { stool_consistency: 'type_6_mushy', stool_colour: 'yellow', stool_blood_present: 'no' },
  },
];

function rowFor(section: SectionCase, over: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 'completed', recommendation: null, read_text: null, description: null,
    foreign_material_present: null, foreign_material_note: null, ai_raw_payload: null,
    edited_at: null, dismissed_at: null, error: null,
    ...section.empty, ...over,
  };
}

function cardStyle(node: { props: { style: unknown } }): { backgroundColor?: unknown } {
  return StyleSheet.flatten(node.props.style) ?? {};
}

describe.each(SECTIONS)('$file — a verdict this build does not know', (section) => {
  const { Section } = section;
  afterEach(() => { mockRow = null; });

  it.each(FUTURE)('%s: spoken as the escalation, in words, on the rose card (never a blank label)', async (verdict) => {
    mockRow = rowFor(section, { recommendation: verdict, read_text: 'The read the server wrote.' });
    const { findByText, getByTestId } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

    expect(await findByText(INCIDENT_REC_LABEL.worth_a_call)).toBeTruthy();
    expect(await findByText('The read the server wrote.')).toBeTruthy();
    expect(cardStyle(getByTestId('incident-read-card')).backgroundColor).toBe(theme.colorEventSymptomLight);
    expect(cardStyle(getByTestId('incident-read-rail')).backgroundColor).toBe(theme.colorEventSymptom);
  });

  it.each(FUTURE)('%s: its facts never fold (a quiet read with the same facts does)', async (verdict) => {
    // Non-vacuity first: these facts DO offer the fold on a quiet read, so the absence
    // below is the verdict's doing, not a fixture that never had a fold to offer.
    mockRow = rowFor(section, { recommendation: 'monitor', ...section.facts });
    const quiet = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await quiet.findByText(OBSERVATION_FOLD_LABEL)).toBeTruthy();
    quiet.unmount();

    mockRow = rowFor(section, { recommendation: verdict, ...section.facts });
    const { findByText, queryByText } = render(<Section eventId="e2" petId="pet-1" petName="Rex" hasPhoto />);
    expect(await findByText(INCIDENT_REC_LABEL.worth_a_call)).toBeTruthy();
    expect(queryByText(OBSERVATION_FOLD_LABEL)).toBeNull();
  });

  it.each(FUTURE)('%s: survives a failed re-read, the CUL-812 shape (the retry frame never replaces it)', async (verdict) => {
    mockRow = rowFor(section, { status: 'failed', recommendation: verdict, read_text: 'The read the server wrote.', error: 'Claude API error 529' });
    const { findByText, queryByText } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

    expect(await findByText(INCIDENT_REC_LABEL.worth_a_call)).toBeTruthy();
    expect(queryByText(/Couldn't finish reading this one/i)).toBeNull();
    expect(queryByText(/Try again/i)).toBeNull();
  });

  it.each(FUTURE)('%s: a photoless one still renders (B-363 suppresses only the empty read)', async (verdict) => {
    mockRow = rowFor(section, { recommendation: verdict, read_text: 'The read the server wrote.' });
    const { findByText } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto={false} />);
    expect(await findByText(INCIDENT_REC_LABEL.worth_a_call)).toBeTruthy();
  });
});

describe.each(SECTIONS)('$file — a status this build does not know', (section) => {
  const { Section } = section;
  afterEach(() => { mockRow = null; });

  const QUIET_CASES = [
    ['monitor', INCIDENT_REC_LABEL.monitor],
    ['not_enough_to_say', INCIDENT_REC_LABEL.not_enough_to_say],
  ] as const;

  describe.each(QUIET_CASES)('a quiet %s', (verdict, words) => {
    it('stands as the read on a FINISHED status (the non-vacuity half)', async () => {
      for (const status of FINISHED_READ_STATUSES) {
        mockRow = rowFor(section, { status, recommendation: verdict, read_text: 'The read the server wrote.' });
        const { findByText, unmount } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
        expect(await findByText(words)).toBeTruthy();
        unmount();
      }
    });

    it.each(FUTURE_STATUSES)('on %s: never stood as the read; the honest "not read yet" frame instead', async (status) => {
      mockRow = rowFor(section, { status, recommendation: verdict, read_text: 'The read the server wrote.', ...section.facts });
      const { findByText, queryByText, queryByTestId } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);

      expect(await findByText('Not enough to say about this one yet.')).toBeTruthy();
      expect(queryByText('Try analysis')).toBeTruthy();
      expect(queryByText(words)).toBeNull();
      expect(queryByText('The read the server wrote.')).toBeNull();
      expect(queryByTestId('incident-read-card')).toBeNull();
      // Its facts go with it: a fact grid under no read is a read by another name.
      expect(queryByText(OBSERVATION_FOLD_LABEL)).toBeNull();
    });

  });

  // Photoless, only `monitor` can tell: a photoless `not_enough_to_say` renders nothing at
  // ANY status (B-363), so an absence there proves nothing about the status rule.
  it.each(FUTURE_STATUSES)('a quiet monitor on %s with no photo: nothing (a finished one renders)', async (status) => {
    // Non-vacuity: the same photoless row on a finished status DOES render the read.
    mockRow = rowFor(section, { status: 'completed', recommendation: 'monitor', read_text: 'The read the server wrote.' });
    const finished = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto={false} />);
    expect(await finished.findByText(INCIDENT_REC_LABEL.monitor)).toBeTruthy();
    finished.unmount();

    mockRow = rowFor(section, { status, recommendation: 'monitor', read_text: 'The read the server wrote.' });
    const { toJSON } = render(<Section eventId="e2" petId="pet-1" petName="Rex" hasPhoto={false} />);
    // The row arrives on a resolved promise inside an effect. Flush it before asserting the
    // absence, or an empty first frame would pass this for free. The finished half above
    // does NOT prove the flush is long enough (`findByText` polls for a second); dropping
    // the status rule from the photoless branch reds this case, which is what proves it.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(toJSON()).toBeNull();
  });

  it.each(FUTURE_STATUSES)('an escalation on %s still stands, in the rose (presence escalates at any status)', async (status) => {
    for (const verdict of ['worth_a_call', ...FUTURE]) {
      mockRow = rowFor(section, { status, recommendation: verdict, read_text: 'The read the server wrote.' });
      const { findByText, getByTestId, unmount } = render(<Section eventId="e1" petId="pet-1" petName="Rex" hasPhoto />);
      expect(await findByText(INCIDENT_REC_LABEL.worth_a_call)).toBeTruthy();
      expect(cardStyle(getByTestId('incident-read-card')).backgroundColor).toBe(theme.colorEventSymptomLight);
      unmount();
    }
  });
});

// ── The predicates every other surface draws through ──────────────────────────

describe('lib/incidentReadState.ts — the rescue and the words', () => {
  it.each(FUTURE)('%s: rescued from a failed re-read, and named in the rose’s words', (verdict) => {
    expect(escalationSurvivesFailure({ recommendation: verdict })).toBe(true);
    expect(incidentVerdictLabel(verdict)).toBe(INCIDENT_REC_LABEL.worth_a_call);
  });

  it('the shipped three keep their own words', () => {
    for (const [verdict, words] of Object.entries(INCIDENT_REC_LABEL)) {
      expect(incidentVerdictLabel(verdict)).toBe(words);
    }
  });

  it('a quiet verdict is unfinished on any status but a finished read; an escalation never is', () => {
    for (const verdict of ['monitor', 'not_enough_to_say']) {
      for (const status of FINISHED_READ_STATUSES) expect(quietVerdictUnfinished({ status, recommendation: verdict })).toBe(false);
      for (const status of [...FUTURE_STATUSES, 'failed', 'capped', 'pending', null]) {
        expect(quietVerdictUnfinished({ status, recommendation: verdict })).toBe(true);
      }
    }
    for (const verdict of ['worth_a_call', ...FUTURE]) {
      for (const status of STATUSES) expect(quietVerdictUnfinished({ status, recommendation: verdict })).toBe(false);
    }
    expect(quietVerdictUnfinished({ status: 'reading_again', recommendation: null })).toBe(false);
    expect(quietVerdictUnfinished(null)).toBe(false);
  });

  it('a value that names a prototype member is not mistaken for a known verdict', () => {
    for (const verdict of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(incidentVerdictLabel(verdict)).toBe(INCIDENT_REC_LABEL.worth_a_call);
    }
  });
});

describe('lib/readState.ts — History, the month, Home’s spine, the Signal gallery', () => {
  it.each(FUTURE_STATUSES)('a quiet verdict on %s is not calm there either: the record and History agree', (status) => {
    for (const verdict of ['monitor', 'not_enough_to_say']) {
      const read = readVerdictOf({ eventType: 'vomit', hasPhoto: true, copy: { status, recommendation: verdict }, inFlight: false, readingOff: false });
      expect(read.state).toBe('unread');
    }
  });

  it.each(FUTURE)('%s: the rose at every status, spoken as `worth_a_call`', (verdict) => {
    for (const status of STATUSES) {
      const copy = { status, recommendation: verdict };
      expect(isWorthACall(copy)).toBe(true);
      for (const hasPhoto of [true, false]) {
        const read = readVerdictOf({ eventType: 'vomit', hasPhoto, copy, inFlight: false, readingOff: false });
        expect(read).toEqual({ state: 'worth_a_call', verdict: 'worth_a_call' });
      }
    }
  });
});

// ── The list itself ───────────────────────────────────────────────────────────

describe('lib/incidentVerdict.ts — the one quiet list', () => {
  it('holds exactly the two shipped quiet verdicts; the escalation is not on it', () => {
    // Adding a value is the one act that makes a verdict calm everywhere at once (and a
    // wellness value may never join it: clinical-guardrails Pattern 1). This pins the
    // list so that act is a visible diff to this line, never a side effect.
    expect([...QUIET_VERDICTS].sort()).toEqual(['monitor', 'not_enough_to_say']);
    expect(isQuietVerdict('worth_a_call')).toBe(false);
    expect(isEscalationVerdict('worth_a_call')).toBe(true);
  });

  it('no verdict at all is not an escalation: nothing to protect, nothing to show', () => {
    expect(isEscalationVerdict(null)).toBe(false);
    expect(isEscalationVerdict(undefined)).toBe(false);
  });
});

// ── Discovery: the surfaces above are every surface there is ─────────────────

/** The same trees and the same field pattern as `guards/readState.test.ts`. */
const SCAN_DIRS = ['app', 'components', 'lib', 'store', 'hooks', 'constants', 'widgets'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'ios', 'android', 'dist']);
const FIELD_PATTERN = /\brecommendation\b/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(abs);
  }
  return out;
}

function verdictReaders(root: string): string[] {
  return SCAN_DIRS.flatMap((d) => walk(path.join(root, d)))
    .filter((abs) => FIELD_PATTERN.test(blankComments(fs.readFileSync(abs, 'utf8'))))
    .map((abs) => path.relative(root, abs).split(path.sep).join('/'))
    .sort();
}

describe('discovery — every client file that reads the verdict is a surface tested above', () => {
  const found = verdictReaders(ROOT);

  it('the scan reaches the real tree (a non-vacuity floor, C-36)', () => {
    // A broken walker finds nothing, and nothing satisfies the equality below.
    expect(found).toContain('components/event/VomitAnalysisSection.tsx');
    expect(found).toContain('lib/readState.ts');
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it('every reader is classified, and every classified file still reads the verdict', () => {
    // Both directions. A new reader with no entry fails here: give it a case above (or,
    // if it only stores the value, a NOT_A_SURFACE reason). An entry whose file no longer
    // reads the verdict fails too, since a stale entry would excuse whatever lands in it.
    const classified = [...Object.keys(SURFACES), ...Object.keys(NOT_A_SURFACE)].sort();
    expect(found).toEqual(classified);
  });

  it('every surface with a render has a case in the section table', () => {
    const rendered = Object.keys(SURFACES).filter((f) => f.startsWith('components/'));
    expect(rendered.sort()).toEqual(SECTIONS.map((s) => s.file).sort());
  });
});
