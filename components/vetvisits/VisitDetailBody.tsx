import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { SectionLabel } from '../ui/SectionLabel';
import { ThemedText } from '../ui/ThemedText';
import {
  askedSummary,
  formatVisitDate,
  formatVisitWeekday,
  formatWhereLine,
  type VetVisitDetail,
} from '../../lib/vetVisits';

interface Props {
  detail: VetVisitDetail;
  /** The RECORD's pet, via `resolveRecordPetName(pets, visit.pet_id)` — CUL-574. */
  petName: string;
  onOpenDocument: (groupId: string) => void;
}

// One visit as written (mock D3, read-only).
//
// *Edit* arrives in VV-4 and is an INLINE action in the header rather than the
// mock's ⋯, because the header's own rule (B-075, a PM call) is that a single
// secondary action belongs inline and not behind a tap-to-reveal menu — and Delete,
// the second one, is VV-6's and gated on CUL-19 deploying the reader that honours
// `deleted_at`. VV-6 is where the pair becomes a ⋯.
//
// The plan rows are LINKS TO RECORDS, and in this PR most of them have nowhere to
// go yet: there is no per-regimen route and no per-trial route in the app (the
// audit in spec §2 — `app/medication/[id].tsx` edits a catalog ITEM, not a
// course). So a course and a trial render as what the record says about them and
// carry no chevron; a document, which does have a route, carries one. A row that
// cannot open does not pretend it can.
export function VisitDetailBody({ detail, petName, onOpenDocument }: Props) {
  const { visit } = detail;
  const where = formatWhereLine({ clinicName: visit.clinic_name, vetName: visit.vet_name });
  const hasPlan =
    detail.medications.length > 0 || detail.trials.length > 0 || !!visit.next_visit_at;
  // 'Asked 3 of 4' — absent when the visit had no prepared questions, where a "0 of
  // 0" would be a score for something the owner never set out to do.
  const asked = askedSummary(detail.questions);

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

      {hasPlan ? (
        <View style={styles.block}>
          <SectionLabel label="The plan" header style={styles.sectionLabel} />
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
              />
            ))}
            {detail.trials.map((trial) => (
              <PlanRow
                key={trial.id}
                title={trial.label}
                sub={trial.status === 'active' ? 'Trial running' : 'Trial ended'}
              />
            ))}
            {visit.next_visit_at ? (
              <PlanRow title="Next visit" sub={formatVisitDate(visit.next_visit_at)} />
            ) : null}
          </View>
        </View>
      ) : null}

      {detail.documents.length > 0 ? (
        <View style={styles.block}>
          <SectionLabel label="Paperwork · in Vet Files" header style={styles.sectionLabel} />
          <View style={styles.rows}>
            {detail.documents.map((doc) => (
              <TouchableOpacity
                key={doc.groupId}
                style={styles.row}
                onPress={() => onOpenDocument(doc.groupId)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={documentLabel(doc.title, doc.documentDate)}
              >
                <View style={styles.rowMain}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {documentLabel(doc.title, doc.documentDate)}
                  </ThemedText>
                </View>
                <ChevronRight size={18} color={theme.colorTextTertiary} strokeWidth={2} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {asked ? (
        <ThemedText style={styles.asked}>{asked} questions</ThemedText>
      ) : null}

      {!visit.notes?.trim() && !hasPlan && detail.documents.length === 0 ? (
        // Not a failure, and not "no data": most visits logged before this track
        // existed are a date, a clinic and nothing else, and saying so plainly
        // beats an empty screen that reads as a load error (Principle 5).
        //
        // It states what the record HOLDS and stops. The first draft ended "…are
        // saved here when you add them", which is an instruction pointing at an
        // affordance this screen does not have — Edit is VV-4's — so it sent the
        // owner hunting for a button on a read-only screen. An empty state may be
        // forward-looking; it may not ask for an action there is no door for.
        <ThemedText style={styles.bare}>
          This visit is on the record as a date and a place — nothing else was written
          down at the time.
        </ThemedText>
      ) : null}
    </View>
  );
}

function documentLabel(title: string | null, documentDate: string | null): string {
  const named = title?.trim();
  if (named) return named;
  const dated = documentDate ? formatVisitDate(documentDate) : '';
  return dated ? `Document — ${dated}` : 'Document';
}

function PlanRow({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      <View style={styles.rowMain}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>
          {title}
        </ThemedText>
        {sub ? <ThemedText style={styles.rowSub}>{sub}</ThemedText> : null}
      </View>
    </View>
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
