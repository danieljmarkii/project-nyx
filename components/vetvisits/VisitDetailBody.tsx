import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight, FileText, Plus } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import { PlanActionRow } from './PlanRows';
import {
  askedSummary,
  formatVisitDate,
  formatVisitWeekday,
  formatWhereLine,
  type VetVisitDetail,
} from '../../lib/vetVisits';
import type { VisitResultsSource } from '../../lib/visitPaperwork';

interface Props {
  detail: VetVisitDetail;
  /** The RECORD's pet, via `resolveRecordPetName(pets, visit.pet_id)` — CUL-574. */
  petName: string;
  onOpenDocument: (groupId: string) => void;
  /** *Add to the plan*: opens How did it go? for this visit, at The plan (§4.4 R1). */
  onAddToPlan: () => void;
  /** A course row's door (`lib/visitPlanDoors.ts`); null leaves the row as text. */
  courseDoor: (med: VetVisitDetail['medications'][number]) => (() => void) | null;
  /** A trial row's door; null leaves the row as text. */
  trialDoor: (trial: VetVisitDetail['trials'][number]) => (() => void) | null;
  /** *Results arrived?*: results filed under this visit (CUL-2759), photographed or a PDF. */
  onResultsArrived: (source: VisitResultsSource) => void;
  /** Whether this binary can pick a PDF from Files (`isDocumentPickerAvailable`). */
  pdfAvailable: boolean;
  /** The results capture is in flight. */
  resultsBusy?: boolean;
}

// One visit as written (mock D3, read-only).
//
// *Edit* arrives in VV-4 and is an INLINE action in the header rather than the
// mock's ⋯, because the header's own rule (B-075, a PM call) is that a single
// secondary action belongs inline and not behind a tap-to-reveal menu — and Delete,
// the second one, is VV-6's and gated on CUL-19 deploying the reader that honours
// `deleted_at`. VV-6 is where the pair becomes a ⋯.
//
// The plan rows are LINKS TO RECORDS (CUL-2759). A course opens the course, a running trial
// opens the trial's own screen, and which door a row gets is `lib/visitPlanDoors.ts`'s call,
// handed in as a callback so this body never routes. A row with no door (an ended trial, a
// course with no library item) renders as what the record says and carries no chevron: a
// row that cannot open does not pretend it can.
//
// THE UNASKED QUESTION IS NAMED (CUL-2759). "Asked 3 of 4" alone hid the one question the
// owner most needs afterwards, the one still to raise on the phone, behind a score. Each
// question not ticked in the room is listed by its own words; the count stays beneath it.
//
// RESULTS ARRIVE LATER (CUL-2759). Bloodwork or a culture comes back days after the visit,
// and *Results arrived?* files it here, in Vet Files under this visit, typed as results. It
// sits with the paperwork, always: the door is for the visit that has none yet.
//
// *ADD TO THE PLAN* IS ALWAYS HERE (CUL-2754, §4.4 R1), on a visit with no plan above all:
// the visit saved in a car park with nothing typed is the one that most needs the door.
export function VisitDetailBody({
  detail, petName, onOpenDocument, onAddToPlan, courseDoor, trialDoor, onResultsArrived, pdfAvailable, resultsBusy,
}: Props) {
  const { visit } = detail;
  const where = formatWhereLine({ clinicName: visit.clinic_name, vetName: visit.vet_name });
  const hasPlan =
    detail.medications.length > 0 || detail.trials.length > 0 || !!visit.next_visit_at;
  // 'Asked 3 of 4' — absent when the visit had no prepared questions, where a "0 of
  // 0" would be a score for something the owner never set out to do.
  const asked = askedSummary(detail.questions);
  const unasked = detail.questions.filter((q) => !q.asked_at);
  const bare = !visit.notes?.trim() && !hasPlan && detail.documents.length === 0;

  return (
    <View>
      <ThemedText style={styles.eyebrow}>{formatVisitWeekday(visit.visited_at)}</ThemedText>
      <ThemedText style={styles.pageTitle}>{visit.reason?.trim() || 'Vet visit'}</ThemedText>
      {/* The record says whose it is, rather than inheriting it from whichever pet
          happens to be active (CUL-660). */}
      <ThemedText style={styles.pageSub}>{where ? `${petName} · ${where}` : petName}</ThemedText>

      {visit.notes?.trim() ? (
        <View style={styles.block}>
          <SectionLabel label="What the vet said" header style={styles.sectionLabel} />
          <ThemedText style={styles.notes}>{visit.notes.trim()}</ThemedText>
        </View>
      ) : null}

      {bare ? (
        // Not a failure, and not "no data": most visits logged before this track existed
        // are a date, a clinic and nothing else. It says what the record holds and points
        // forward, and the door it points at is right below it (Principle 5).
        <ThemedText style={styles.bare}>
          This visit has a date and a place so far. Add what the vet decided whenever you have it.
        </ThemedText>
      ) : null}

      <View style={styles.block}>
        {hasPlan ? <SectionLabel label="The plan" header style={styles.sectionLabel} /> : null}
        <View style={styles.rows}>
          {detail.medications.map((med) => (
            <PlanRow
              key={med.id}
              title={med.drugName}
              // The course's own numbers stay the course's (CUL-746): this row
              // says what the visit STARTED, never how many doses it has seen.
              sub={[med.doseAmount, med.status === 'active' ? 'Still on it' : 'Ended']
                .filter(Boolean)
                .join(' · ')}
              onPress={courseDoor(med)}
            />
          ))}
          {detail.trials.map((trial) => (
            <PlanRow
              key={trial.id}
              title={trial.label}
              sub={trial.status === 'active' ? 'Trial running' : 'Trial ended'}
              onPress={trialDoor(trial)}
            />
          ))}
          {visit.next_visit_at ? (
            <PlanRow title="Next visit" sub={formatVisitDate(visit.next_visit_at)} />
          ) : null}
          <PlanActionRow
            glyph={<Plus size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title="Add to the plan"
            subtitle="A med, a trial, a recheck, paperwork"
            actionLabel="Add"
            onPress={onAddToPlan}
          />
        </View>
      </View>

      <View style={styles.block}>
        <SectionLabel label="Paperwork · in Vet Files" header style={styles.sectionLabel} />
        <View style={styles.rows}>
          {detail.documents.map((doc) => {
            const label = visitDocumentLabel(doc);
            return (
              <TouchableOpacity
                key={doc.groupId}
                style={styles.row}
                onPress={() => onOpenDocument(doc.groupId)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <View style={styles.rowMain}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {label}
                  </ThemedText>
                </View>
                <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
              </TouchableOpacity>
            );
          })}
          <PlanActionRow
            glyph={<FileText size={16} color={theme.colorTextTertiary} strokeWidth={2} />}
            title="Results arrived?"
            subtitle="A printout or a PDF, filed under this visit"
            actionLabel="Photograph"
            onPress={() => onResultsArrived('camera')}
            busy={resultsBusy}
            // A binary without the Files picker gets no PDF button rather than a dimmed
            // one (C-7); the camera still works there.
            secondaryLabel={pdfAvailable ? 'PDF' : undefined}
            onSecondaryPress={pdfAvailable ? () => onResultsArrived('files') : undefined}
          />
        </View>
      </View>

      {unasked.length > 0 ? (
        <View style={styles.block}>
          <SectionLabel label="Not asked at the visit" header style={styles.sectionLabel} />
          <View style={styles.rows}>
            {unasked.map((q) => (
              <View key={q.id} style={styles.row} accessible accessibilityLabel={`Not asked: ${q.text.trim()}`}>
                <View style={styles.rowMain}>
                  <ThemedText style={styles.questionText}>{q.text.trim()}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {asked ? (
        <ThemedText style={styles.asked}>{asked} questions</ThemedText>
      ) : null}

    </View>
  );
}

/** A document's name on the visit page: the owner's title, else what it is and its date.
 *  An untitled lab result reads as *Results*, the word the door that filed it used. */
export function visitDocumentLabel(doc: { title: string | null; kind: string; documentDate: string | null }): string {
  const named = doc.title?.trim();
  if (named) return named;
  const noun = doc.kind === 'lab_result' ? 'Results' : 'Document';
  const dated = doc.documentDate ? formatVisitDate(doc.documentDate) : '';
  return dated ? `${noun} — ${dated}` : noun;
}

// One row, two hosts (C-7): a row with a door is a button with a chevron, a row without one
// is a plain `accessible` View, never a touchable carrying `disabled`.
function PlanRow({ title, sub, onPress }: { title: string; sub: string; onPress?: (() => void) | null }) {
  const label = sub ? `${title}, ${sub}` : title;
  const body = (
    <View style={styles.rowMain}>
      <ThemedText style={styles.rowTitle} numberOfLines={1}>
        {title}
      </ThemedText>
      {sub ? <ThemedText style={styles.rowSub}>{sub}</ThemedText> : null}
    </View>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
      <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: theme.textXS,
    fontWeight: theme.weightMedium,
    textTransform: 'uppercase',
    letterSpacing: theme.trackingWidest,
    color: theme.colorTextTertiary,
  },
  pageTitle: {
    fontSize: theme.textXL,
    fontWeight: theme.weightSemibold,
    color: theme.colorTextPrimary,
    letterSpacing: theme.trackingTight,
    marginTop: 4,
  },
  pageSub: {
    fontSize: theme.textSM,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  block: {
    marginTop: theme.space3,
  },
  sectionLabel: {
    marginBottom: theme.space1,
  },
  notes: {
    fontSize: theme.textMD,
    lineHeight: 22,
    color: theme.colorTextPrimary,
  },
  rows: {
    borderRadius: theme.radiusMedium,
    borderWidth: 1,
    borderColor: theme.colorBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space2,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: theme.textMD,
    fontWeight: theme.weightMedium,
    color: theme.colorTextPrimary,
  },
  rowSub: {
    fontSize: theme.textXS,
    color: theme.colorTextSecondary,
    marginTop: 2,
  },
  questionText: {
    fontSize: theme.textMD,
    lineHeight: theme.lineHeightBody,
    color: theme.colorTextPrimary,
  },
  asked: {
    fontSize: theme.textXS,
    color: theme.colorTextTertiary,
    marginTop: theme.space3,
  },
  bare: {
    fontSize: theme.textSM,
    lineHeight: theme.lineHeightSM,
    color: theme.colorTextSecondary,
    marginTop: theme.space3,
  },
});
