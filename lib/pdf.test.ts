// Unit tests for the vet-report client (Step 9, Phase 2 PR 5).
//
// The load-bearing pure piece is reportPdfFilename (path-safe naming for the vet's
// PIMS filing) and generateVetReport's contract handling (a blank body must SURFACE,
// never render blank — the function always renders designed empty states, so an
// empty response means the call itself failed). The native PDF/print/share path
// (shareReportPdf) is integration, verified on-device; the modules are mocked here
// only so importing pdf.ts doesn't drag native code into jest.

import {
  flushBeforeReport, reportFreshnessLine, reportPdfFilename, reportPdfFilenameFor, reportPdfFilenameV2, generateVetReport,
  reportVersionFor, shareReportPdf, type VetReport,
} from './pdf';
import { useBetaOptInStore } from './betaFeatures';
import { supabase } from './supabase';
import { getSyncStatus } from './db';
import { clearTransientFiles } from './transientFiles';
import { waitFor } from '@testing-library/react-native';
import { syncNow } from './sync';
import * as Print from 'expo-print';
import { fetchOwnerSurname } from './profile';
import * as Sharing from 'expo-sharing';

jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: { getSession: jest.fn() } },
}));
// getDeviceTimezone (B-443) rides the report request; pin it so the body assertion is
// deterministic under any runner clock (the non-UTC CI job runs jest in Kiritimati/Chatham/Honolulu).
jest.mock('./profile', () => ({ getDeviceTimezone: jest.fn(() => 'America/Chicago'), fetchOwnerSurname: jest.fn() }));
// The freshness gate's two dependencies — mocked at the module edge so the gate's
// control flow (the part the adversarial pass broke) is what the tests exercise.
jest.mock('./db', () => ({ getSyncStatus: jest.fn() }));
// CUL-2347 — Gate 1 for the report layout, read through allowlistFlagNow. Only
// `report_document_v2` is consulted; every test starts with it off (the shipped seed).
let mockDocumentEligible = false;
jest.mock('../hooks/useAppConfig', () => ({
  allowlistFlagNow: (key: string) => key === 'report_document_v2' && mockDocumentEligible,
}));
jest.mock('./sync', () => ({ syncNow: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

// An in-memory cache directory, so where the report lands and what the sign-out wipe
// leaves behind are asserted by enumerating files rather than by reading the code
// (CUL-1045). `copyThrows` drives the "clinic-name copy failed → share the raw temp
// uri" fallback (mock-prefixed so jest can hoist the factory over it).
const mockFs = { files: new Map<string, string>(), dirs: new Set<string>(), copyThrows: false };
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    // A directory exists if it was created OR holds a file, as on disk (expo-print
    // creates <Caches>/Print itself; nothing here calls create() for it).
    get exists() {
      return mockFs.dirs.has(this.uri) || [...mockFs.files.keys()].some((k) => k.startsWith(`${this.uri}/`));
    }
    create() { mockFs.dirs.add(this.uri); }
    delete() {
      for (const key of [...mockFs.files.keys()]) if (key.startsWith(`${this.uri}/`)) mockFs.files.delete(key);
      mockFs.dirs.delete(this.uri);
    }
    // The files directly inside this directory (what the legacy root sweep walks).
    list() {
      const prefix = `${this.uri}/`;
      return [...mockFs.files.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map((key) => new File(key));
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get exists() { return mockFs.files.has(this.uri); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    delete() { mockFs.files.delete(this.uri); }
    copy(dest: { uri: string }) {
      if (mockFs.copyThrows) throw new Error('copy failed');
      const body = mockFs.files.get(this.uri);
      if (body === undefined) throw new Error(`no such file: ${this.uri}`);
      mockFs.files.set(dest.uri, body);
    }
  }
  return { Paths: { cache: { uri: 'file:///cache' } }, Directory, File };
});

const mockedInvoke = supabase.functions.invoke as jest.Mock;
const mockedIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockedShare = Sharing.shareAsync as jest.Mock;
const mockedPrint = Print.printToFileAsync as jest.Mock;

describe('reportPdfFilename', () => {
  it('builds a clinic-friendly name with the range', () => {
    expect(reportPdfFilename('Nyx', '2026-04-04', '2026-07-03')).toBe(
      'Nyx-vet-report-2026-04-04-to-2026-07-03.pdf',
    );
  });

  it('sanitises punctuation/spaces/slashes so the path can never break', () => {
    expect(reportPdfFilename("Mr. O'Malley /2", '2026-01-01', '2026-02-01')).toBe(
      'Mr-O-Malley-2-vet-report-2026-01-01-to-2026-02-01.pdf',
    );
  });

  it('falls back to "pet" when the name is empty or all-symbols', () => {
    expect(reportPdfFilename('', '2026-01-01', '2026-02-01')).toBe('pet-vet-report-2026-01-01-to-2026-02-01.pdf');
    expect(reportPdfFilename('***', '2026-01-01', '2026-02-01')).toBe('pet-vet-report-2026-01-01-to-2026-02-01.pdf');
  });

  it('omits the range segment when dates are missing', () => {
    expect(reportPdfFilename('Nyx', '', '')).toBe('Nyx-vet-report.pdf');
  });
});

// CUL-2292 (spec §8, §5.7) — the v2 name: "Pet-Surname_owner-home-log_<start>_to_<end>.pdf",
// the surname only from `last_name`, transliterated, omitted when empty.
describe('reportPdfFilenameV2', () => {
  it('names the patient and the owner, then the window', () => {
    expect(reportPdfFilenameV2('Cooper', 'Reyes', '2026-04-04', '2026-07-03')).toBe(
      'Cooper-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf',
    );
  });

  it('transliterates marked and spelled-out Latin letters rather than dropping them', () => {
    expect(reportPdfFilenameV2('Zoë', 'Müller', '2026-01-01', '2026-02-01')).toBe('Zoe-Muller_owner-home-log_2026-01-01_to_2026-02-01.pdf');
    expect(reportPdfFilenameV2('Søren', 'Łukasiewicz', '2026-01-01', '2026-02-01')).toBe('Soren-Lukasiewicz_owner-home-log_2026-01-01_to_2026-02-01.pdf');
    expect(reportPdfFilenameV2('Æsir', 'Straße', '2026-01-01', '2026-02-01')).toBe('AEsir-Strasse_owner-home-log_2026-01-01_to_2026-02-01.pdf');
    expect(reportPdfFilenameV2('Nyx', 'Peña Núñez', '2026-01-01', '2026-02-01')).toBe('Nyx-Pena-Nunez_owner-home-log_2026-01-01_to_2026-02-01.pdf');
  });

  it('omits the surname when it is empty, blank, null or has no Latin letter to keep', () => {
    for (const surname of [null, '', '   ', '李', 'Ωμέγα', '—']) {
      expect(reportPdfFilenameV2('Cooper', surname, '2026-04-04', '2026-07-03')).toBe('Cooper_owner-home-log_2026-04-04_to_2026-07-03.pdf');
    }
  });

  it('keeps every path character out, and falls back to "pet" for a name with nothing to keep', () => {
    expect(reportPdfFilenameV2('../../etc/passwd', "O'Brien/..", '2026-04-04', '2026-07-03')).toBe(
      'etc-passwd-O-Brien_owner-home-log_2026-04-04_to_2026-07-03.pdf',
    );
    expect(reportPdfFilenameV2('***', 'Reyes', '2026-04-04', '2026-07-03')).toBe('pet-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf');
  });

  it('prints the window only when both ends are real days', () => {
    expect(reportPdfFilenameV2('Cooper', 'Reyes', '', '')).toBe('Cooper-Reyes_owner-home-log.pdf');
    expect(reportPdfFilenameV2('Cooper', 'Reyes', '2026-04-04', '../x')).toBe('Cooper-Reyes_owner-home-log.pdf');
  });

  it('caps each name at 40 characters, never ending on a hyphen', () => {
    const name = reportPdfFilenameV2('A'.repeat(39) + ' Bcdef', 'Reyes', '2026-04-04', '2026-07-03');
    expect(name).toBe(`${'A'.repeat(39)}-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf`);
  });
});

describe('reportPdfFilenameFor', () => {
  const base: VetReport = {
    html: '', petName: 'Cooper', startDate: '2026-04-04', endDate: '2026-07-03', scopeBasis: 'since_visit', photoCount: 0,
    trialAllowedListMissing: false, reportVersion: 'v1', ownerSurname: 'Reyes',
  };
  it('a v1 report keeps the v1 name, even with a surname on hand', () => {
    expect(reportPdfFilenameFor(base)).toBe('Cooper-vet-report-2026-04-04-to-2026-07-03.pdf');
  });
  it('a v2 report is filed as the owner home log', () => {
    expect(reportPdfFilenameFor({ ...base, reportVersion: 'v2' })).toBe('Cooper-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf');
  });
});

describe('generateVetReport — the version and the surname (CUL-2292)', () => {
  const mockedSession = supabase.auth.getSession as jest.Mock;
  const mockedSurname = fetchOwnerSurname as jest.Mock;
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockedSurname.mockReset().mockResolvedValue('Reyes');
  });

  it('a v1 response (or none named) is v1 and reads no surname', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '<html>x</html>', report_version: 'v1' }, error: null });
    const r = await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(r.reportVersion).toBe('v1');
    expect(r.ownerSurname).toBeNull();
    mockedInvoke.mockResolvedValue({ data: { html: '<html>x</html>' }, error: null });
    expect((await generateVetReport({ petId: 'p1', includeNotes: true })).reportVersion).toBe('v1');
    expect(mockedSurname).not.toHaveBeenCalled();
  });

  it('a v2 response reads the signed-in owner\'s last_name', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '<html>x</html>', report_version: 'v2' }, error: null });
    const r = await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(r.reportVersion).toBe('v2');
    expect(r.ownerSurname).toBe('Reyes');
    expect(mockedSurname).toHaveBeenCalledWith('user-1');
  });

  it('no session, or a read that throws, leaves the surname out and the report still opens', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedInvoke.mockResolvedValue({ data: { html: '<html>x</html>', report_version: 'v2' }, error: null });
    mockedSession.mockResolvedValue({ data: { session: null } });
    expect((await generateVetReport({ petId: 'p1', includeNotes: true })).ownerSurname).toBeNull();
    expect(mockedSurname).not.toHaveBeenCalled();
    mockedSession.mockRejectedValue(new Error('storage'));
    const r = await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(r.ownerSurname).toBeNull();
    expect(r.html).toContain('x');
    warn.mockRestore();
  });
});

describe('generateVetReport', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockDocumentEligible = false;
    useBetaOptInStore.getState().reset();
  });

  it('returns the html + scope metadata on success', async () => {
    mockedInvoke.mockResolvedValue({
      data: { html: '<html>Nyx</html>', pet_name: 'Nyx', start_date: '2026-04-04', end_date: '2026-07-03', scope_basis: 'fallback_90d' },
      error: null,
    });
    const r = await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(r.html).toContain('Nyx');
    expect(r.startDate).toBe('2026-04-04');
    expect(r.scopeBasis).toBe('fallback_90d');
    expect(r.photoCount).toBe(0); // absent photo_count → 0, never undefined (owner-visibility line hides)
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: { petId: 'p1', includeNotes: true, timezone: 'America/Chicago' } });
  });

  it('parses photo_count for the owner-visibility line (PR 7)', async () => {
    mockedInvoke.mockResolvedValue({
      data: { html: '<html>Nyx</html>', pet_name: 'Nyx', start_date: '2026-04-04', end_date: '2026-07-03', scope_basis: 'fallback_90d', photo_count: 3 },
      error: null,
    });
    const r = await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(r.photoCount).toBe(3);
  });

  // R-16 (CUL-998 / CUL-861) — the pre-send allowed-list fact is the FUNCTION's verdict.
  it('parses trial_allowed_list_missing, and an absent field is false (a pre-deploy client shows nothing)', async () => {
    mockedInvoke.mockResolvedValue({
      data: { html: '<html>Nyx</html>', trial_allowed_list_missing: true },
      error: null,
    });
    expect((await generateVetReport({ petId: 'p1', includeNotes: true })).trialAllowedListMissing).toBe(true);

    mockedInvoke.mockResolvedValue({ data: { html: '<html>Nyx</html>' }, error: null });
    expect((await generateVetReport({ petId: 'p1', includeNotes: true })).trialAllowedListMissing).toBe(false);

    // Only a literal `true` counts — a truthy string or a 1 is a contract drift, not a fact.
    mockedInvoke.mockResolvedValue({ data: { html: '<html>Nyx</html>', trial_allowed_list_missing: 'yes' }, error: null });
    expect((await generateVetReport({ petId: 'p1', includeNotes: true })).trialAllowedListMissing).toBe(false);
  });

  it('throws on an Edge Function error', async () => {
    mockedInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(generateVetReport({ petId: 'p1', includeNotes: true })).rejects.toThrow(/boom/);
  });

  it('throws (never renders blank) when the html body comes back empty', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '' }, error: null });
    await expect(generateVetReport({ petId: 'p1', includeNotes: true })).rejects.toThrow(/empty/i);
  });

  it('forwards a custom window override to the function body', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '<html></html>' }, error: null });
    await generateVetReport({ petId: 'p1', startDate: '2026-05-01', endDate: '2026-06-01', includeNotes: true });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', {
      body: { petId: 'p1', startDate: '2026-05-01', endDate: '2026-06-01', includeNotes: true, timezone: 'America/Chicago' },
    });
  });

  // CUL-1464 — an explicit false reaches the wire. The server reads an absent value as ON,
  // so the field is required on the type and must survive the spread unchanged.
  it('forwards includeNotes: false as false, never dropped', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '<html></html>' }, error: null });
    await generateVetReport({ petId: 'p1', includeNotes: false });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', {
      body: { petId: 'p1', includeNotes: false, timezone: 'America/Chicago' },
    });
  });
});

describe('shareReportPdf', () => {
  const report: VetReport = {
    html: '<html>Nyx</html>', petName: 'Nyx', startDate: '2026-04-04', endDate: '2026-07-03', scopeBasis: 'fallback_90d', photoCount: 0,
    trialAllowedListMissing: false, reportVersion: 'v1', ownerSurname: null,
  };
  // Where expo-print really writes (ExpoPrintToFile.swift): <Caches>/Print/<uuid>.pdf.
  const PRINT_TEMP = 'file:///cache/Print/print-tmp.pdf';
  const NAMED = 'Nyx-vet-report-2026-04-04-to-2026-07-03.pdf';
  // What existed at the moment the share sheet received the file: a share of a file
  // that is already gone would "succeed" here and send the vet nothing.
  let presentAtShare: boolean | null = null;

  beforeEach(() => {
    mockFs.files.clear();
    mockFs.dirs.clear();
    mockFs.copyThrows = false;
    presentAtShare = null;
    mockedIsAvailable.mockReset();
    mockedShare.mockReset().mockImplementation(async (uri: string) => {
      presentAtShare = mockFs.files.has(uri);
    });
    mockedPrint.mockReset().mockImplementation(async () => {
      mockFs.files.set(PRINT_TEMP, '%PDF-1.7 the whole record');
      return { uri: PRINT_TEMP };
    });
  });

  it('returns false and never prints when the platform has no share sheet', async () => {
    mockedIsAvailable.mockResolvedValue(false);
    const ok = await shareReportPdf(report);
    expect(ok).toBe(false);
    expect(mockedPrint).not.toHaveBeenCalled();
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('renders the html to a PDF and shares the clinic-named copy from the transient directory', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    const ok = await shareReportPdf(report);
    expect(ok).toBe(true);
    expect(mockedPrint).toHaveBeenCalledWith({ html: report.html });
    // Shares the renamed clinic-friendly file, not the raw temp uri.
    expect(mockedShare).toHaveBeenCalledWith(
      `file:///cache/transient/${NAMED}`,
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    );
    expect(presentAtShare).toBe(true);
    // expo-print's temp is outside every wipe, so it goes once the sheet has closed.
    expect(mockFs.files.has(PRINT_TEMP)).toBe(false);
  });

  it('a v2 report is shared under the owner-home-log name (CUL-2292)', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    await shareReportPdf({ ...report, reportVersion: 'v2', ownerSurname: 'Reyes' });
    expect(mockedShare).toHaveBeenCalledWith(
      'file:///cache/transient/Nyx-Reyes_owner-home-log_2026-04-04_to_2026-07-03.pdf',
      expect.anything(),
    );
    expect(presentAtShare).toBe(true);
  });

  it('falls back to the raw temp uri (never blocks sharing) when the rename copy fails', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    mockFs.copyThrows = true;
    const ok = await shareReportPdf(report);
    expect(ok).toBe(true);
    expect(mockedShare).toHaveBeenCalledWith(PRINT_TEMP, expect.anything());
    expect(presentAtShare).toBe(true); // deleted after the share, never before it
    expect(mockFs.files.has(PRINT_TEMP)).toBe(false);
  });

  it('a share that throws still deletes the print temp', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    mockedShare.mockRejectedValue(new Error('share sheet failed'));
    await expect(shareReportPdf(report)).rejects.toThrow('share sheet failed');
    expect(mockFs.files.has(PRINT_TEMP)).toBe(false);
  });

  // CUL-1045, proved by behaviour rather than by reading the diff: the report is the
  // whole clinical record under the pet's name, and the sign-out wipe (lib/db.ts →
  // clearTransientFiles, which account deletion also runs) must leave none of it behind.
  // An absence proves a wipe only when the thing wiped was there, so the copy is
  // asserted present first.
  it('leaves no copy of the report in the cache once the sign-out wipe has run', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    await shareReportPdf(report);
    expect(mockFs.files.has(`file:///cache/transient/${NAMED}`)).toBe(true);

    clearTransientFiles();

    expect([...mockFs.files.keys()]).toEqual([]);
  });

  // The process can die with the share sheet open (the owner leaves to look up the
  // vet's address and iOS kills the app), and then the `finally` never runs. The
  // print temp is the whole record too, so the wipe clears expo-print's folder itself.
  it('a share the app never returns from still leaves nothing after the wipe', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    mockedShare.mockImplementation(() => new Promise(() => {}));
    void shareReportPdf(report);
    await waitFor(() => expect(mockedShare).toHaveBeenCalled());
    expect(mockFs.files.has(PRINT_TEMP)).toBe(true);

    clearTransientFiles();

    expect([...mockFs.files.keys()]).toEqual([]);
  });

  // Builds before CUL-1045 left the named copy in the cache ROOT, where nothing else
  // would ever find it. The wipe sweeps that one name shape and leaves the rest alone.
  it('the wipe also removes the report copies older builds left in the cache root', () => {
    mockFs.files.set(`file:///cache/${NAMED}`, '%PDF old build');
    mockFs.files.set('file:///cache/Mr-O-Malley-vet-report.pdf', '%PDF old build, no range');
    mockFs.files.set('file:///cache/unrelated.json', '{}');

    clearTransientFiles();

    expect([...mockFs.files.keys()]).toEqual(['file:///cache/unrelated.json']);
  });
});

// ── B-534 — the freshness gate ──────────────────────────────────────────────
//
// The adversarial pass executed seven dependency-failure shapes against the
// first cut and three of them silently cleared the disclosure while the code
// held positive evidence of unsent rows. These tests pin every shape.

describe('flushBeforeReport (B-534)', () => {
  const mockedStatus = getSyncStatus as jest.Mock;
  const mockedSyncNow = syncNow as jest.Mock;
  const status = (pendingCount: number, quarantinedCount = 0) => ({
    pendingCount, oldestPendingAt: null, quarantinedCount,
  });

  beforeEach(() => {
    mockedStatus.mockReset();
    mockedSyncNow.mockReset().mockResolvedValue(undefined);
  });

  it('nothing pending → no flush, clean counts', async () => {
    mockedStatus.mockResolvedValueOnce(status(0));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 0, quarantined: 0 });
    expect(mockedSyncNow).not.toHaveBeenCalled();
  });

  it('pending rows that the flush lands → clean counts', async () => {
    mockedStatus.mockResolvedValueOnce(status(3)).mockResolvedValueOnce(status(0));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 0, quarantined: 0 });
    expect(mockedSyncNow).toHaveBeenCalledTimes(1);
  });

  it('pending rows the flush cannot move (offline no-op) → counts stand', async () => {
    mockedStatus.mockResolvedValueOnce(status(3)).mockResolvedValueOnce(status(3));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 3, quarantined: 0 });
  });

  it('FAIL-SAFE: syncNow throwing must not clear a positive count', async () => {
    // The adversarial break: `stillPending` was only ever raised by the
    // re-count, so a throw here reported "current" with unsent rows in hand.
    mockedStatus.mockResolvedValueOnce(status(2));
    mockedSyncNow.mockRejectedValueOnce(new Error('boom'));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 2, quarantined: 0 });
  });

  it('FAIL-SAFE: the re-count throwing must not clear a positive count', async () => {
    mockedStatus.mockResolvedValueOnce(status(2)).mockRejectedValueOnce(new Error('boom'));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 2, quarantined: 0 });
  });

  it('the first count failing is silence, not a standing false alarm', async () => {
    // With no evidence either way, warning on every report whenever a local
    // read hiccups would be the B-398 wrong-advice-forever failure inverted.
    mockedStatus.mockRejectedValueOnce(new Error('boom'));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 0, quarantined: 0 });
    expect(mockedSyncNow).not.toHaveBeenCalled();
  });

  it('quarantined-only rows skip the flush (nothing a connection can move) but surface', async () => {
    mockedStatus.mockResolvedValueOnce(status(0, 2));
    await expect(flushBeforeReport()).resolves.toEqual({ pending: 0, quarantined: 2 });
    expect(mockedSyncNow).not.toHaveBeenCalled();
  });
});

describe('reportFreshnessLine (B-534, the B-398 two-state rule)', () => {
  it('is silent when the record is current', () => {
    expect(reportFreshnessLine({ pending: 0, quarantined: 0 })).toBeNull();
  });

  it('pending → the connection remedy', () => {
    const line = reportFreshnessLine({ pending: 3, quarantined: 0 })!;
    expect(line).toContain('hasn’t synced yet');
    expect(line).toContain('this report may not include it');
    expect(line).toContain('Connect to the internet');
  });

  it('quarantined LEADS, and never gets the connection advice', () => {
    // "waiting for a connection" is true of a pending row and a lie about a
    // quarantined one (store/syncStore.ts) — the adversarial pass caught the
    // first cut telling a quarantined owner to connect, forever.
    const line = reportFreshnessLine({ pending: 5, quarantined: 2 })!;
    expect(line).toContain('couldn’t be saved to your records');
    expect(line).toContain('History');
    expect(line).not.toContain('Connect to the internet');
  });

  it('speaks singular for one quarantined entry', () => {
    const line = reportFreshnessLine({ pending: 0, quarantined: 1 })!;
    expect(line).toContain('1 entry');
    expect(line).toContain('may not include it');
  });
});

// ── CUL-2347 — the "New report layout" switch asks for v2, and only it ───────────
// PM ruling (a) on CUL-2290: an opt-in, default off. The server renders v2 only when the
// request asks AND its own flag read agrees; this pins the asking half. Everyone who is
// not eligible-and-opted-in sends today's body exactly: no reportVersion key at all.
describe('reportVersionFor — both gates, never one', () => {
  it('asks for v2 only when eligible AND opted in', () => {
    expect(reportVersionFor(true, true)).toBe('v2');
    expect(reportVersionFor(true, false)).toBeNull();
    expect(reportVersionFor(false, true)).toBeNull();
    expect(reportVersionFor(false, false)).toBeNull();
  });
});

describe('generateVetReport — reportVersion on the wire (CUL-2347)', () => {
  const TODAY = { petId: 'p1', includeNotes: true, timezone: 'America/Chicago' };
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue({ data: { html: '<html></html>' }, error: null });
    mockDocumentEligible = false;
    useBetaOptInStore.getState().reset();
  });

  it('an allowlisted owner who flips the switch sends reportVersion: v2', async () => {
    mockDocumentEligible = true;
    useBetaOptInStore.getState().setOptIn('report_document_v2', true);
    await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: { ...TODAY, reportVersion: 'v2' } });
  });

  it('an allowlisted owner who has not flipped it sends today\'s body (the switch starts off)', async () => {
    mockDocumentEligible = true;
    await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: TODAY });
  });

  it('a switch left on after the account leaves the allowlist sends today\'s body', async () => {
    useBetaOptInStore.getState().setOptIn('report_document_v2', true);
    await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: TODAY });
  });

  it('a v1 body carries no reportVersion key at all, not an undefined one', async () => {
    mockDocumentEligible = true;
    await generateVetReport({ petId: 'p1', includeNotes: true });
    const sent = mockedInvoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(Object.keys(sent)).not.toContain('reportVersion');
  });

  it('a store that throws on read sends today\'s body (fails closed)', async () => {
    mockDocumentEligible = true;
    useBetaOptInStore.getState().setOptIn('report_document_v2', true);
    const spy = jest.spyOn(useBetaOptInStore, 'getState').mockImplementation(() => {
      throw new Error('store unavailable');
    });
    try {
      await generateVetReport({ petId: 'p1', includeNotes: true });
    } finally {
      spy.mockRestore();
    }
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: TODAY });
  });

  it('the other report switch (the new flow) never asks for the layout', async () => {
    mockDocumentEligible = true;
    useBetaOptInStore.getState().setOptIn('report_composer_v2', true);
    await generateVetReport({ petId: 'p1', includeNotes: true });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: TODAY });
  });
});
