// A Signal finding's identity: the key that survives a re-rank (CUL-784 §5.2), shared
// by the phone and the server (Engines v3 PR-11a, CUL-1267).
//
// WHY ITS OWN FILE. The phone keys folds, routes and the Signal screen on it
// (`lib/signalFold.ts` re-exports it as `foldIdentity`), and generate-signal writes it
// into `signal_shown_log.finding_key` so EN-9 and EN-14 can follow one finding across
// runs. Those must be the SAME derivation, not a mirror (C-34: a mirrored constant
// answers its source's question only while someone keeps it in step). signalFold.ts
// imports AsyncStorage, which the Edge runtime cannot load, so the derivation lives
// here: no imports, no owner-facing words, safe inside the Edge Functions' closure
// (C-26 — a change here redeploys generate-signal on merge).
//
// The input is structural so both runtimes' finding types fit: the client's
// `SignalFinding` and the engine's `Finding`.

export interface IdentifiableFinding {
  type: string;
  incidentType?: string;
  symptomType?: string;
  protein?: string;
  proteins?: string[];
}

/**
 * A correlation's protein cluster: `proteins` when the engine sent one, else the single
 * `protein` (rows cached before multi-protein findings carry only that). `proteinCluster`
 * in `lib/signalCopy.ts` delegates here.
 */
export function correlationCluster(finding: { protein?: string; proteins?: string[] }): string[] {
  return finding.proteins && finding.proteins.length > 0 ? finding.proteins : [finding.protein as string];
}

/**
 * `type` + the noun the sentence is about. Rank is presentation and moves as findings
 * come and go; the key must survive a re-rank so a fold follows its finding. A lone
 * `postprandial_timing` that becomes a `timing_story` is a NEW identity and renders open
 * — correct: the card's shape changed. Every key starts with its own `type` (migration
 * 075's `signal_shown_log_key_names_its_type` CHECK depends on it).
 */
export function findingIdentity(finding: IdentifiableFinding): string {
  switch (finding.type) {
    case 'food_symptom_correlation':
      // The cluster, sorted — a member joining is a new key (a new identity, §5.3).
      return `${finding.type}:${[...correlationCluster(finding)].sort().join('+')}`;
    case 'incident_red_flag':
      // A fold on a vomit flag never covers a later stool flag.
      return `${finding.type}:${finding.incidentType}`;
    case 'trial_response':
    case 'intake_decline':
      // One per pet.
      return finding.type;
    default:
      return `${finding.type}:${finding.symptomType}`;
  }
}
