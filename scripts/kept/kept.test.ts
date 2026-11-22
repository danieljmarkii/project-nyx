// The kept list (CUL-2886). The four Done-when fixtures lead: a clinical path, a mock
// reaction and a forecast overrun each return kept; a CI change returns none. Every check
// here is proven by mutation in mutants.ts.

import { classesBackToKept, keptOf, pathsIn, teamCallClass, type KeptInput, type TeamCall } from './kept.ts';

describe('the Done-when fixtures', () => {
  it('a clinical path returns kept: stakes', () => {
    const r = keptOf({ files: ['lib/signalWindows.ts'], text: 'Tidy the window helper' });
    expect(r.kept).toBe('stakes');
    expect(r.reasons).toContain('stakes: clinical surface (by name)');
    expect(keptOf({ files: ['supabase/functions/generate-signal/detection.ts'], text: 'Tidy' }).kept).toBe('stakes');
  });
  it('a mock reaction returns kept: taste, even inside a named round', () => {
    const r = keptOf({ files: ['docs/home-mockups-round-3.html'], text: 'Take the R-2 reaction: the quieter header', ratifiedRound: 'Home round 3' });
    expect(r.kept).toBe('taste');
    expect(r.reasons).toContain('taste: a reaction to a mock');
  });
  it('a forecast overrun returns kept: scope', () => {
    const r = keptOf({ files: ['scripts/dispatch/plan.ts'], text: 'One more row for the board', forecast: { rows: 3, built: 4 } });
    expect(r).toEqual({ kept: 'scope', reasons: ['scope: past its forecast (4 rows against 3)'] });
  });
  it('a CI change returns none', () => {
    const r = keptOf({ labels: ['Area: CI/Build'], files: ['.github/workflows/ci.yml'], text: 'Bump the setup-node action SHA and its version comment' });
    expect(r).toEqual({ kept: 'none', reasons: [] });
  });
});

describe('stakes', () => {
  it.each([
    [{ labels: ['Gate: clinical'], text: 'x' }, 'stakes: clinical (label Gate: clinical)'],
    [{ labels: ['Gate: privacy'], text: 'x' }, 'stakes: privacy (label Gate: privacy)'],
    [{ labels: ['Area: Privacy/RLS'], text: 'x' }, 'stakes: privacy (label Area: Privacy/RLS)'],
    [{ files: ['lib/storage.ts'] }, 'stakes: privacy, Storage, deletion, export or share links (by name)'],
    [{ files: ['supabase/functions/report-visit-link/index.ts'] }, 'stakes: server code over health data (supabase/)'],
    [{ files: ['supabase/migrations/124_x.sql'] }, 'stakes: schema (a migration)'],
    [{ migration: true }, 'stakes: schema (a migration)'],
    [{ files: ['lib/appConfig.ts'] }, 'stakes: money or Pets > $ (by name)'],
    [{ files: ['app.json'] }, 'stakes: App Store or legal'],
    [{ files: ['docs/legal/privacy-policy.md'] }, 'stakes: App Store or legal'],
    [{ text: 'the n=1 never reassures rule' }, 'stakes: clinical'],
    [{ text: 'Rotate the share link on revoke' }, 'stakes: privacy, RLS, Storage, deletion, export or share links'],
    [{ text: 'a new paywall on export' }, 'stakes: money or Pets > $'],
    [{ text: 'ships through App Review' }, 'stakes: App Store or legal'],
    [{ text: 'purge the cached rows' }, 'stakes: irreversible (a revert PR or a Linear edit cannot undo it)'],
    [{ text: 'sends an email to every owner' }, 'stakes: irreversible (a revert PR or a Linear edit cannot undo it)'],
    [{ text: 'the schema grows a column' }, 'stakes: schema'],
  ])('%j keeps: %s', (input, reason) => {
    const r = keptOf(input);
    expect(r.kept).toBe('stakes');
    expect(r.reasons).toContain(reason);
  });

  it('uncertain counts as kept: nothing to read is stakes', () => {
    expect(keptOf({})).toEqual({ kept: 'stakes', reasons: ['stakes: nothing to read (uncertain counts as kept)'] });
    expect(keptOf({ text: '   ' }).reasons).toEqual(['stakes: nothing to read (uncertain counts as kept)']);
    expect(keptOf({ files: ['widgets/Home.swift'] }).reasons).toContain('stakes: privacy (the widget shows health data outside the app)');
  });

  it('stakes outranks taste and scope, and every reason is listed', () => {
    const r = keptOf({ files: ['lib/storage.ts', 'docs/home-mockups.html'], text: 'out of scope for now' });
    expect(r.kept).toBe('stakes');
    expect(r.reasons.map((x) => x.split(':')[0])).toEqual(['stakes', 'taste', 'scope']);
  });
});

// Adversarial pass 1 (2026-11-22): every input below returned `none` and must keep.
describe('adversarial pass 1: the quiet breaks stay kept', () => {
  it.each<[KeptInput]>([
    // Q2 to Q4: health, privacy and money files a hand list missed.
    ...[
      'supabase/functions/_shared/incident-tier.ts',
      'supabase/functions/extract-food-from-photo/index.ts',
      'supabase/functions/reap-report-drafts/index.ts',
      'lib/ask.ts',
      'lib/symptomEpisodes.ts',
      'lib/freeFedIntake.ts',
      'lib/feedingArrangements.ts',
      'lib/emergencyDoorRead.ts',
      'lib/analysis.ts',
      'lib/mayWaitLine.ts',
      'lib/callNowDated.ts',
      'lib/vomitContents.ts',
      'lib/stoolForm.ts',
      'lib/medicationDose.ts',
      'lib/weightStory.ts',
      'lib/vetVisitLink.ts',
      'lib/reportVisitLink.ts',
      'lib/reportSend.ts',
      'lib/pdf.ts',
      'lib/attachments.ts',
      'lib/eventPhoto.ts',
      'lib/captureUploads.ts',
      'lib/transientFiles.ts',
      'lib/db.ts',
      'lib/account.ts',
      'lib/secureStore.ts',
      'lib/supabase.ts',
      'lib/aiConsent.ts',
      'lib/recordConsent.ts',
      'lib/analytics.ts',
      'store/authStore.ts',
      'store/aiConsentStore.ts',
      'constants/monetizationCopy.ts',
      'constants/flags.ts',
      'lib/betaFeatures.ts',
      'widgets/Home.swift',
    ].map((f) => [{ files: [f], text: 'refactor', named: true }] as unknown as [KeptInput]),
    // Q5: everyday wording.
    ...[
      'Cat stopped eating: flag intake decline as picky',
      'Treat a single vomit as reassuring',
      'Call the cat picky on the empty state',
      'Soften the appetite-drop warning',
      'Move the red-flag threshold',
      'Escalating the call line',
      'Reassurance copy for the read',
      'the vet-report header',
      'a hepatic lipidosis rule',
      'the anorexia detector',
      'Delete account flow',
      'Deleting photos',
      'the storage bucket',
      'Export PDF',
      'exporting the timeline',
      'Share-link expiry',
      'the visit link token',
      'Raise the Pets cap to 3',
      'Price change for Pro',
      'Monetization tier',
      'Free tier limit',
      'RevenueCat purchase',
      'Add a column for the bowl',
      'ALTER TABLE meals',
      'TestFlight submission notes',
      'App-Store screenshots',
      'Wipe the user data',
      'Rotate the service key',
      'Notify all users',
      'Email every user',
      'Remove the bucket',
      'Publish to production',
      'Drop the table',
    ].map((t) => [{ labels: ['Area: CI/Build'], files: ['scripts/dispatch/plan.ts'], text: t }] as [KeptInput]),
    // Q6: labels, any case or spacing.
    ...['Area: Correctness', 'Gate: deploy', 'gate: clinical', 'Gate:clinical', 'Gate: Clinical'].map((l) => [{ labels: [l, 'Area: CI/Build'], files: ['scripts/dispatch/plan.ts'], text: 'x' }] as [KeptInput]),
    // Q7: blank entries are nothing to read.
    [{ labels: [''] }],
    [{ files: [''] }],
    [{ forecast: { rows: 3, built: 3 } }],
  ])('%j is kept as stakes', (input) => {
    // Each case is isolated (a neutral tooling file and label), so the rule it names must
    // fire on its own; a file is named by a stem or a tree, never only by the fallback.
    const { named, ...rest } = input as KeptInput & { named?: boolean };
    const r = keptOf(rest);
    expect(r.kept).toBe('stakes');
    if (named) expect(r.reasons.some((x) => /cannot place|uncertain/.test(x))).toBe(false);
    if (!(rest.files ?? []).filter(Boolean).length && !(rest.labels ?? []).filter(Boolean).length) expect(r.reasons).toEqual(['stakes: nothing to read (uncertain counts as kept)']);
  });

  it('GA gate is scope; Live harm alone is fixed now, not held', () => {
    expect(keptOf({ labels: ['GA gate'], files: ['scripts/dispatch/plan.ts'], text: 'x' }).kept).toBe('scope');
    expect(keptOf({ labels: ['Live harm'], files: ['scripts/dispatch/plan.ts'], text: 'the empty state shows the old pet' }).kept).toBe('none');
    expect(keptOf({ labels: ['Live harm', 'Gate: privacy'], text: 'x' }).kept).toBe('stakes');
  });

  it('engineering and UI files that name no stake stay team calls', () => {
    for (const f of ['lib/utils.ts', 'lib/haptics.ts', 'lib/textWidth.ts', 'scripts/dispatch/plan.ts', 'guards/x.test.ts', '.github/workflows/ci.yml']) {
      expect([f, keptOf({ files: [f], text: 'tidy' }).kept]).toEqual([f, 'none']);
    }
  });
});

// Adversarial pass 2 (2026-11-22, the last allowed): every input below returned `none`.
// The fix is structural (product code, scripts and file-less input keep by default), so
// these hold whether or not a stem names them.
describe('adversarial pass 2: the quiet breaks stay kept', () => {
  it.each<[string]>([
    ['lib/rundown.ts'], ['lib/sameMinuteDuplicates.ts'], ['hooks/useGapWarning.ts'], ['hooks/useEn5.ts'], ['lib/hydration.ts'],
    ['lib/foodArchive.ts'], ['lib/captureInbox.ts'], ['lib/emailConfirm.ts'], ['lib/visitPaperwork.ts'], ['lib/dashboardCards.ts'],
    ['lib/ruleSeam.ts'], ['store/petStore.ts'], ['app/signal/[id].tsx'], ['app/trial/[pet].tsx'], ['app/medication/[id].tsx'],
    ['app/reports/[id].tsx'], ['app/vet-call/[id].tsx'], ['app/(tabs)/index.tsx'], ['components/vetvisits/VisitRow.tsx'],
    ['components/vetfiles/AddDocumentSheet.tsx'], ['components/profile/ArchivePetSheet.tsx'],
    ['.github/workflows/edge-deploy.yml'], ['scripts/deploy-edge.sh'], ['scripts/edge-deploy/plan.ts'],
    ['scripts/b416-protein-backfill/applied-1.sql'], ['scripts/backfill-proteins.mjs'], ['scripts/engine-replay/export.sql'],
    ['scripts/clinical-voice/call-baseline.sql'], ['scripts/report-preview/x.ts'],
  ])('%s is kept', (f) => {
    expect(keptOf({ files: [f], text: 'tidy' }).kept).not.toBe('none');
  });

  it.each<[string]>([
    ['Cat stopped eating'], ['hasn\'t eaten in 2 days'], ['not eating'], ['eating less'], ['skipped meals'], ['food left in the bowl'],
    ['decline flag'], ['all clear line'], ['everything looks normal'], ['no concerns state'], ['calm read'], ['single sample read'],
    ['n=1 rule'], ['throwing up'], ['regurgitation'], ['loose poop'], ['blood in litter'], ['weight loss'], ['seizure'], ['nausea'],
    ['CKD'], ['kidney'], ['hyperthyroid'], ['emergency vet'], ['urgent'], ['alert banner'], ['signal tier'], ['Established tier fires'],
    ['correlation engine'], ['McNemar'], ['false positive rate'], ['elimination trial'], ['food trial'], ['remove account'],
    ['erase my data'], ['sign out'], ['photo upload'], ['auth flow'], ['anon key'], ['row level security'], ['data leak'], ['GDPR'],
    ['data retention'], ['share sheet'], ['PDF'], ['archive a pet'], ['remove a pet'], ['Stripe'], ['refund'], ['billing'],
    ['free trial'], ['Pro plan'], ['IAP'], ['EULA'], ['add a nullable column'], ['add `notes` column to meals'], ['new enum value'],
    ['push notification'], ['deploy to prod'],
  ])('the words %j keep, even on a tooling file', (t) => {
    expect(keptOf({ labels: ['Area: CI/Build'], files: ['scripts/dispatch/plan.ts'], text: t }).kept).not.toBe('none');
  });

  it('an input that names no file keeps, whatever its labels', () => {
    expect(keptOf({ text: 'Card spacing' }).kept).toBe('stakes');
    expect(keptOf({ labels: ['Area: CI/Build'], text: 'Bump the setup-node action SHA' }).kept).toBe('stakes');
  });

  it('a file named without its folder keeps, on any work; root files are placed', () => {
    expect(keptOf({ files: ['rundown.ts'], text: 'tidy' }).kept).toBe('stakes');
    expect(keptOf({ labels: ['Area: AI infra'], files: ['plan.ts'], text: 'tidy' }).kept).toBe('stakes');
    expect(keptOf({ files: ['deploy.sh'], text: 'tidy' }).kept).toBe('stakes');
    expect(keptOf({ files: ['app.json'] }).reasons).toContain('stakes: App Store or legal');
  });

  it('pathsIn finds a path in every shape the pass tried', () => {
    expect(pathsIn('Fix the off-by-one in **lib/intakeEvidence.ts**')).toEqual(['lib/intakeEvidence.ts']);
    expect(pathsIn('*lib/x.ts* _lib/y.ts_ lib/z.ts! lib/w.ts? lib/v.ts… lib/u.ts— <lib/t.ts> [lib/s.ts] |lib/r.ts| lib/q.ts#L42')).toEqual(
      ['lib/x.ts', 'lib/y.ts', 'lib/z.ts', 'lib/w.ts', 'lib/v.ts', 'lib/u.ts', 'lib/t.ts', 'lib/s.ts', 'lib/r.ts', 'lib/q.ts'],
    );
    expect(pathsIn('./lib/x.ts, lib/{a,b}.ts and supabase/functions/*/index.ts')).toEqual(['lib/x.ts', 'lib/{a,b}.ts', 'supabase/functions/*/index.ts']);
    expect(pathsIn('`app/vet-visits/[id].tsx` and (app/(tabs)/index.tsx)')).toEqual(['app/vet-visits/[id].tsx', 'app/(tabs)/index.tsx']);
    expect(pathsIn('a split path lib/\nrundown.ts')).toEqual(['lib/', 'rundown.ts']);
    expect(keptOf({ files: pathsIn('a split path lib/\nrundown.ts'), text: 'x' }).kept).toBe('stakes');
  });

  it('the digest class reads copy from its own words and labels in any case', () => {
    expect(teamCallClass({ text: 'copy the fixture into the new suite' })).toBe('engineering');
    expect(teamCallClass({ labels: ['area: copy/voice'] })).toBe('copy');
    expect(teamCallClass({ labels: ['Area: UX Polish'] })).toBe('ux');
  });
});

describe('taste', () => {
  const N = ['lib/haptics.ts']; // UI mechanics: a team call on its own, so each test reads one rule
  it('a visual choice outside a ratified round is kept; inside a named one it is the team call', () => {
    expect(keptOf({ files: N, text: 'a new layout for the header' }).kept).toBe('taste');
    expect(keptOf({ files: N, text: 'a new layout for the header', ratifiedRound: 'Home round 3' }).kept).toBe('none');
    // A round must be named: "n/a" or "TBD" frees nothing (adversarial pass 2, Q5).
    expect(keptOf({ files: N, text: 'a new layout for the header', ratifiedRound: 'n/a' }).kept).toBe('taste');
  });
  it('a screen or component is taste until a named round covers it; a clinical one is stakes', () => {
    expect(keptOf({ files: ['components/home/HomeHeader.tsx'], text: 'tidy' }).kept).toBe('taste');
    expect(keptOf({ files: ['components/home/HomeHeader.tsx'], text: 'tidy', ratifiedRound: 'R-3' }).kept).toBe('none');
    expect(keptOf({ files: ['components/home/SignalZone.tsx'], text: 'tidy', ratifiedRound: 'R-3' }).kept).toBe('stakes');
  });
  it('a mock file is taste unless its round is named; Gate: design likewise', () => {
    expect(keptOf({ files: ['docs/ask-mockups.html'] }).kept).toBe('taste');
    expect(keptOf({ files: ['docs/ask-mockups.html'], ratifiedRound: 'Ask round 2' }).kept).toBe('none');
    expect(keptOf({ labels: ['Gate: design'], files: N, text: 'x' }).kept).toBe('taste');
    expect(keptOf({ labels: ['Gate: design'], files: N, text: 'x', ratifiedRound: 'Ask round 2' }).kept).toBe('none');
  });
  it('brand stays kept whatever round is named', () => {
    expect(keptOf({ files: N, text: 'the brand mark on Landing', ratifiedRound: 'Landing round 1' }).kept).toBe('taste');
    expect(keptOf({ files: ['assets/icon.png'], ratifiedRound: 'Landing round 1' }).kept).toBe('taste');
  });
  it('copy words are not taste on their own (the old keyword test stays gone)', () => {
    expect(keptOf({ files: N, text: 'Fix the string on the empty state, inside nyx-voice' }).kept).toBe('none');
    expect(keptOf({ files: ['app/log.tsx'], text: 'The label truncates on a 390pt phone', ratifiedRound: 'round 4' }).kept).toBe('none');
  });
});

describe('scope', () => {
  const N = ['scripts/dispatch/plan.ts'];
  it('in or out of a project, priority between tracks, and a spec edit', () => {
    expect(keptOf({ files: N, text: 'move the widget out of scope for 1.2.0' }).kept).toBe('scope');
    expect(keptOf({ files: N, text: 'reprioritise the trial track over Ask' }).reasons).toContain('scope: scope (in or out of a project, priority between tracks, a spec edit)');
    expect(keptOf({ files: ['docs/nyx-ask-requirements.md'] }).kept).toBe('scope');
    expect(keptOf({ files: N, text: 'the Tier-2 edits' }).kept).toBe('scope');
  });
  it('a forecast met is not an overrun', () => {
    expect(keptOf({ files: N, text: 'a routine row', forecast: { rows: 3, built: 3 } }).kept).toBe('none');
  });
  it('a session record is the archive, not a spec', () => {
    expect(keptOf({ files: ['docs/sessions/2026-11-22-x.md'] }).kept).toBe('none');
  });
});

describe('the reversal rule', () => {
  const NOW = '2026-11-22T12:00:00Z';
  const call = (cls: TeamCall['cls'], daysAgo: number, reversed = false): TeamCall => ({
    issue: 'CUL-1',
    cls,
    at: new Date(new Date(NOW).getTime() - daysAgo * 86_400_000).toISOString(),
    reversed,
  });

  it('a class above 10% over four weeks returns to kept, and says so', () => {
    const calls = [...Array.from({ length: 9 }, (_, i) => call('copy', i)), call('copy', 3, true), call('copy', 4, true)];
    const out = classesBackToKept(calls, NOW);
    expect(out).toEqual([{ cls: 'copy', calls: 11, reversed: 2, sentence: 'copy calls return to kept: the PM reversed 2 of 11 (18%) in the last four weeks, over the 10% line.' }]);
  });
  it('exactly 10% stays a team call', () => {
    const calls = [...Array.from({ length: 9 }, (_, i) => call('engineering', i)), call('engineering', 2, true)];
    expect(classesBackToKept(calls, NOW)).toEqual([]);
  });
  it('a reversal older than four weeks does not count', () => {
    expect(classesBackToKept([call('ux', 1), call('ux', 29, true)], NOW)).toEqual([]);
    expect(classesBackToKept([call('ux', 1), call('ux', 27, true)], NOW).map((b) => b.cls)).toEqual(['ux']);
  });
  it('a moved class keeps its calls: copy as taste, engineering as scope', () => {
    expect(keptOf({ files: ['scripts/dispatch/plan.ts'], text: 'nyx-voice copy for the toast', backToKept: ['copy'] }).kept).toBe('taste');
    expect(keptOf({ files: ['scripts/dispatch/plan.ts'], text: 'a planner fix', backToKept: ['engineering'] }).kept).toBe('scope');
    expect(keptOf({ files: ['scripts/dispatch/plan.ts'], text: 'a planner fix', backToKept: ['copy'] }).kept).toBe('none');
  });
});

describe('the digest class', () => {
  it('copy, doc, UX, engineering', () => {
    expect(teamCallClass({ labels: ['Area: Copy/Voice'] })).toBe('copy');
    expect(teamCallClass({ files: ['docs/dev-handoff-runbook.md'] })).toBe('doc');
    expect(teamCallClass({ files: ['components/home/X.tsx', 'lib/y.ts'] })).toBe('ux');
    expect(teamCallClass({ files: ['.github/workflows/ci.yml'] })).toBe('engineering');
  });
});
