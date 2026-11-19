// Vet contacts PR-06 (CUL-2749 / CUL-2768): the record surfaces read a call, text or email as
// itself, and a clinic visit as shipped. Spec §4.6, AC 7 (device half), AC 16; mock §D.
//
// THE FLAG-OFF DIFFERENTIAL (C-36). "Flag off is byte-identical" is asserted against the
// feature's ABSENCE: a phone contact rendered with the feature off must equal the same record
// with no channel at all (the shipped row shape, which carries none), never a flag-on/flag-off
// diff. Each differential first proves it is not vacuous: the flag-on tree of the same record
// differs, so the comparison is over a record that would leak if the gate were deleted.
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react-native';
import { VisitRow } from './VisitRow';
import { VisitDetailBody } from './VisitDetailBody';
import { CourseSourceRow } from './CourseSourceRow';
import { DayCardBody } from '../historyV2/DayCard';
import {
  buildVisitListRow,
  type LocalVetVisit,
  type VetVisitDetail,
  type VisitLinks,
} from '../../lib/vetVisits';
import type { DateOnlyItem } from '../../lib/historyDays';

const NOW = new Date(2026, 10, 14, 12, 0, 0);

function visitRecord(over: Partial<LocalVetVisit> = {}): LocalVetVisit {
  return {
    id: 'v-nov9', pet_id: 'pet-nyx', visited_at: '2026-11-09', clinic_name: null, vet_name: null,
    reason: 'Ear, still shaking her head', notes: null, next_visit_at: null, deleted_at: null,
    channel: 'phone', contacted_at: null, ...over,
  };
}

const NO_LINKS: VisitLinks = {
  medicationNames: [], trialCount: 0, documentCount: 0, hasNextVisit: false, nextVisitAt: null, nextVisitBooked: false,
};

/** The shipped record: the same row with no channel field, as `main` reads it. */
function withoutChannel(v: LocalVetVisit): LocalVetVisit {
  const { channel: _c, contacted_at: _t, ...rest } = v;
  return rest;
}

const tree = () => screen.toJSON();

// ── The list (D1) ─────────────────────────────────────────────────────────────

describe('VisitRow — the channel tag and "No exam" (D1)', () => {
  it('a phone contact carries its tag, "No exam" and the tag inside its spoken sentence', () => {
    render(<VisitRow row={buildVisitListRow(visitRecord(), NO_LINKS, NOW)} onPress={jest.fn()} showChannel />);
    expect(screen.getByText('Phone')).toBeTruthy();
    expect(screen.getByText('No exam')).toBeTruthy();
    expect(screen.getByLabelText('Nov 9, phone, no exam, Ear, still shaking her head')).toBeTruthy();
  });

  it('a clinic visit carries "Visit" and never "No exam"', () => {
    const row = buildVisitListRow(
      visitRecord({ channel: 'in_clinic', visited_at: '2026-09-16', reason: 'Potential ear infection', clinic_name: 'Completely Cat Clinic', vet_name: 'Dr Miller' }),
      NO_LINKS, NOW,
    );
    render(<VisitRow row={row} onPress={jest.fn()} showChannel />);
    expect(screen.getByText('Visit')).toBeTruthy();
    expect(screen.queryByText('No exam')).toBeNull();
    expect(screen.getByLabelText('Sep 16, visit, Potential ear infection, Completely Cat Clinic · Dr Miller')).toBeTruthy();
  });

  it('a contact with no reason is "Call on Nov 9", never "Visit on Nov 9"', () => {
    render(<VisitRow row={buildVisitListRow(visitRecord({ reason: null }), NO_LINKS, NOW)} onPress={jest.fn()} showChannel />);
    expect(screen.getByText('Call on Nov 9')).toBeTruthy();
    expect(screen.queryByText(/Visit on/)).toBeNull();
  });

  it('flag off: a phone contact renders exactly as the shipped row with no channel (non-vacuous)', () => {
    const on = render(<VisitRow row={buildVisitListRow(visitRecord({ reason: null }), NO_LINKS, NOW)} onPress={jest.fn()} showChannel />);
    const onTree = JSON.stringify(tree());
    on.unmount();
    render(<VisitRow row={buildVisitListRow(visitRecord({ reason: null }), NO_LINKS, NOW)} onPress={jest.fn()} />);
    const offTree = JSON.stringify(tree());
    screen.unmount();
    render(<VisitRow row={buildVisitListRow(withoutChannel(visitRecord({ reason: null })), NO_LINKS, NOW)} onPress={jest.fn()} />);
    const absentTree = JSON.stringify(tree());
    expect(onTree).not.toEqual(absentTree);
    expect(offTree).toEqual(absentTree);
  });
});

// ── The contact's page (D2, D3) ───────────────────────────────────────────────

function detail(visit: LocalVetVisit, over: Partial<VetVisitDetail> = {}): VetVisitDetail {
  return {
    visit,
    links: NO_LINKS,
    questions: [],
    medications: [],
    trials: [],
    documents: [],
    ...over,
  };
}

type BodyProps = ComponentProps<typeof VisitDetailBody>;
function bodyProps(d: VetVisitDetail, over: Partial<BodyProps> = {}): BodyProps {
  return {
    detail: d,
    petName: 'Nyx',
    onOpenDocument: jest.fn(),
    onAddToPlan: jest.fn(),
    courseDoor: () => jest.fn(),
    trialDoor: () => null,
    onResultsArrived: jest.fn(),
    pdfAvailable: true,
    ...over,
  };
}

const D2 = detail(visitRecord(), {
  medications: [{ id: 'm1', drugName: 'Motazol', doseAmount: null, status: 'active', medicationItemId: 'item-1' }],
  documents: [
    { groupId: 'g1', title: 'Texts', kind: 'other', documentDate: '2026-11-09' },
    { groupId: 'g2', title: 'Text with the drug name', kind: 'other', documentDate: '2026-11-10' },
  ],
});

describe('VisitDetailBody — a contact reads as itself (D2, D3)', () => {
  it('D2: the call names its pet, its channel, its day and "no exam", then what was sent and started', () => {
    render(<VisitDetailBody {...bodyProps(D2)} contactsOn />);
    expect(screen.getByText('Nyx’s call')).toBeTruthy();
    expect(screen.getByText('Phone · Mon, Nov 9 · no exam')).toBeTruthy();
    expect(screen.getByLabelText('Nyx’s call. Phone, Mon, Nov 9, no exam')).toBeTruthy();
    expect(screen.getByText('What the vet sent')).toBeTruthy();
    expect(screen.getByText('What the vet started')).toBeTruthy();
    expect(screen.getByLabelText('Texts, Nov 9')).toBeTruthy();
    expect(screen.getByLabelText('Text with the drug name, Nov 10')).toBeTruthy();
    // The shipped tappable PlanRow: the started course is a door.
    expect(screen.getByLabelText('Motazol, Still on it').props.accessibilityRole).toBe('button');
    expect(screen.getByText('Your vet report shows this call and the Motazol. Screenshots stay in Vet Files; share them from there.')).toBeTruthy();
    expect(screen.queryByText('Vet visit')).toBeNull();
    expect(screen.queryByText('The plan')).toBeNull();
  });

  it('D3: an email with nothing on it keeps its time, and the footnote drops "and what it started"', () => {
    // 4:10 pm on Nov 13 in the device's zone, built from local parts (C-29).
    const at = new Date(2026, 10, 13, 16, 10, 0).toISOString();
    const juniper = detail(visitRecord({ id: 'v-j', pet_id: 'pet-j', channel: 'email', visited_at: '2026-11-13', reason: null, contacted_at: at }));
    render(<VisitDetailBody {...bodyProps(juniper, { petName: 'Juniper' })} contactsOn />);
    expect(screen.getByText('Juniper’s email')).toBeTruthy();
    expect(screen.getByText('Email · Fri, Nov 13, 4:10 pm · no exam')).toBeTruthy();
    expect(screen.getByText('This email has a day and a time so far. Add what the vet sent or started whenever you have it.')).toBeTruthy();
    expect(screen.getByText('Your vet report shows this email. No exam.')).toBeTruthy();
  });

  it('texts read as plural', () => {
    render(<VisitDetailBody {...bodyProps(detail(visitRecord({ channel: 'text' })))} contactsOn />);
    expect(screen.getByText('Nyx’s texts')).toBeTruthy();
    expect(screen.getByText('Your vet report shows these texts. No exam.')).toBeTruthy();
  });

  it('a clinic visit with the feature on is the shipped page', () => {
    const clinic = detail(visitRecord({ channel: 'in_clinic' }));
    render(<VisitDetailBody {...bodyProps(clinic)} contactsOn />);
    const onTree = JSON.stringify(tree());
    screen.unmount();
    render(<VisitDetailBody {...bodyProps(detail(withoutChannel(visitRecord({ channel: 'in_clinic' }))))} />);
    expect(onTree).toEqual(JSON.stringify(tree()));
    expect(screen.getByText('Ear, still shaking her head')).toBeTruthy();
  });

  it('flag off: a phone contact renders exactly as the shipped record with no channel (non-vacuous)', () => {
    render(<VisitDetailBody {...bodyProps(D2)} contactsOn />);
    const onTree = JSON.stringify(tree());
    screen.unmount();
    render(<VisitDetailBody {...bodyProps(D2)} />);
    const offTree = JSON.stringify(tree());
    screen.unmount();
    render(<VisitDetailBody {...bodyProps({ ...D2, visit: withoutChannel(D2.visit) })} />);
    const absentTree = JSON.stringify(tree());
    expect(onTree).not.toEqual(absentTree);
    expect(offTree).toEqual(absentTree);
  });

  it('an unknown channel (never learned by this phone) reads as shipped, never as a contact', () => {
    render(<VisitDetailBody {...bodyProps(detail(visitRecord({ channel: null })))} contactsOn />);
    expect(screen.queryByText('Nyx’s call')).toBeNull();
    expect(screen.getByText('Ear, still shaking her head')).toBeTruthy();
  });
});

// ── A course's source (D5, AC 7 device half) ──────────────────────────────────

describe('CourseSourceRow (D5)', () => {
  it('names the contact and opens it', () => {
    const onPress = jest.fn();
    render(<CourseSourceRow source={{ visitId: 'v-nov9', channel: 'phone', visitedAt: `${new Date().getFullYear()}-11-09` }} onPress={onPress} />);
    expect(screen.getByText('Started after a call with the vet, Nov 9')).toBeTruthy();
    const row = screen.getByLabelText('Started after a call with the vet, Nov 9. Opens the call');
    expect(row.props.accessibilityRole).toBe('button');
  });

  it('a course from a clinic visit says "a visit"', () => {
    render(<CourseSourceRow source={{ visitId: 'v-sep', channel: 'in_clinic', visitedAt: `${new Date().getFullYear()}-09-16` }} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Started after a visit, Sep 16. Opens the visit')).toBeTruthy();
  });
});

// ── History's row (D4) ────────────────────────────────────────────────────────

const historyProps = {
  openRuns: new Set<string>(),
  onToggleRun: () => {},
  onOpenVisit: jest.fn(),
  landed: false,
  nodes: [],
  shownRows: [],
  noticed: false,
};

describe('History — a contact’s title follows its channel (D4)', () => {
  const base = { kind: 'visit' as const, day: '2026-11-09', id: 'v-nov9', reason: 'Ear, still shaking her head', where: '' };
  it.each([
    ['phone', 'Phone call with the vet', 'call'],
    ['text', 'Texts with the vet', 'texts'],
    ['email', 'Email with the vet', 'email'],
  ] as const)('%s reads "%s · … · no exam" and opens the %s', (channel, title, noun) => {
    const item: DateOnlyItem = { ...base, channel };
    render(<DayCardBody {...historyProps} day="2026-11-09" items={[item]} />);
    expect(screen.getByLabelText(`${title}, Ear, still shaking her head · no exam. Opens the ${noun}`)).toBeTruthy();
    expect(screen.queryByText(/Vet visit/)).toBeNull();
  });

  it('a clinic visit keeps "Vet visit", with or without its channel', () => {
    const shipped: DateOnlyItem = { ...base, where: 'Completely Cat Clinic' };
    render(<DayCardBody {...historyProps} day="2026-11-09" items={[shipped]} />);
    const shippedTree = JSON.stringify(tree());
    expect(screen.getByLabelText('Vet visit, Ear, still shaking her head · Completely Cat Clinic. Opens the visit')).toBeTruthy();
    screen.unmount();
    render(<DayCardBody {...historyProps} day="2026-11-09" items={[{ ...shipped, channel: 'in_clinic' }]} />);
    expect(JSON.stringify(tree())).toEqual(shippedTree);
  });
});
