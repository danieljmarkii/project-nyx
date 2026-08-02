// Unit tests for the vet-report client (Step 9, Phase 2 PR 5).
//
// The load-bearing pure piece is reportPdfFilename (path-safe naming for the vet's
// PIMS filing) and generateVetReport's contract handling (a blank body must SURFACE,
// never render blank — the function always renders designed empty states, so an
// empty response means the call itself failed). The native PDF/print/share path
// (shareReportPdf) is integration, verified on-device; the modules are mocked here
// only so importing pdf.ts doesn't drag native code into jest.

import {
  flushBeforeReport, reportFreshnessLine, reportPdfFilename, generateVetReport,
  shareReportPdf, type VetReport,
} from './pdf';
import { supabase } from './supabase';
import { getSyncStatus } from './db';
import { syncNow } from './sync';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));
// getDeviceTimezone (B-443) rides the report request; pin it so the body assertion is
// deterministic under any runner clock (the non-UTC CI job runs jest in Kiritimati/Chatham/Honolulu).
jest.mock('./profile', () => ({ getDeviceTimezone: jest.fn(() => 'America/Chicago') }));
// The freshness gate's two dependencies — mocked at the module edge so the gate's
// control flow (the part the adversarial pass broke) is what the tests exercise.
jest.mock('./db', () => ({ getSyncStatus: jest.fn() }));
jest.mock('./sync', () => ({ syncNow: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

// File.copy throws when this is set — drives the "clinic-name copy failed → share the
// raw temp uri" fallback branch (mock-prefixed so jest can hoist the factory over it).
const mockFileControl = { copyThrows: false };
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache' } },
  File: class {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() { return false; }
    delete() {}
    copy() {
      if (mockFileControl.copyThrows) throw new Error('copy failed');
    }
  },
}));

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

describe('generateVetReport', () => {
  beforeEach(() => mockedInvoke.mockReset());

  it('returns the html + scope metadata on success', async () => {
    mockedInvoke.mockResolvedValue({
      data: { html: '<html>Nyx</html>', pet_name: 'Nyx', start_date: '2026-04-04', end_date: '2026-07-03', scope_basis: 'fallback_90d' },
      error: null,
    });
    const r = await generateVetReport({ petId: 'p1' });
    expect(r.html).toContain('Nyx');
    expect(r.startDate).toBe('2026-04-04');
    expect(r.scopeBasis).toBe('fallback_90d');
    expect(r.photoCount).toBe(0); // absent photo_count → 0, never undefined (owner-visibility line hides)
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: { petId: 'p1', timezone: 'America/Chicago' } });
  });

  it('parses photo_count for the owner-visibility line (PR 7)', async () => {
    mockedInvoke.mockResolvedValue({
      data: { html: '<html>Nyx</html>', pet_name: 'Nyx', start_date: '2026-04-04', end_date: '2026-07-03', scope_basis: 'fallback_90d', photo_count: 3 },
      error: null,
    });
    const r = await generateVetReport({ petId: 'p1' });
    expect(r.photoCount).toBe(3);
  });

  it('throws on an Edge Function error', async () => {
    mockedInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(generateVetReport({ petId: 'p1' })).rejects.toThrow(/boom/);
  });

  it('throws (never renders blank) when the html body comes back empty', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '' }, error: null });
    await expect(generateVetReport({ petId: 'p1' })).rejects.toThrow(/empty/i);
  });

  it('forwards a custom window override to the function body', async () => {
    mockedInvoke.mockResolvedValue({ data: { html: '<html></html>' }, error: null });
    await generateVetReport({ petId: 'p1', startDate: '2026-05-01', endDate: '2026-06-01' });
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', {
      body: { petId: 'p1', startDate: '2026-05-01', endDate: '2026-06-01', timezone: 'America/Chicago' },
    });
  });
});

describe('shareReportPdf', () => {
  const report: VetReport = {
    html: '<html>Nyx</html>', petName: 'Nyx', startDate: '2026-04-04', endDate: '2026-07-03', scopeBasis: 'fallback_90d', photoCount: 0,
  };
  beforeEach(() => {
    mockedIsAvailable.mockReset();
    mockedShare.mockReset().mockResolvedValue(undefined);
    mockedPrint.mockReset().mockResolvedValue({ uri: 'file:///cache/print-tmp.pdf' });
    mockFileControl.copyThrows = false;
  });

  it('returns false and never prints when the platform has no share sheet', async () => {
    mockedIsAvailable.mockResolvedValue(false);
    const ok = await shareReportPdf(report);
    expect(ok).toBe(false);
    expect(mockedPrint).not.toHaveBeenCalled();
    expect(mockedShare).not.toHaveBeenCalled();
  });

  it('renders the html to a PDF and shares the clinic-named file', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    const ok = await shareReportPdf(report);
    expect(ok).toBe(true);
    expect(mockedPrint).toHaveBeenCalledWith({ html: report.html });
    // Shares the renamed clinic-friendly file, not the raw temp uri.
    expect(mockedShare).toHaveBeenCalledWith(
      'file:///cache/Nyx-vet-report-2026-04-04-to-2026-07-03.pdf',
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    );
  });

  it('falls back to the raw temp uri (never blocks sharing) when the rename copy fails', async () => {
    mockedIsAvailable.mockResolvedValue(true);
    mockFileControl.copyThrows = true;
    const ok = await shareReportPdf(report);
    expect(ok).toBe(true);
    expect(mockedShare).toHaveBeenCalledWith('file:///cache/print-tmp.pdf', expect.anything());
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
