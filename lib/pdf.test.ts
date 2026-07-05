// Unit tests for the vet-report client (Step 9, Phase 2 PR 5).
//
// The load-bearing pure piece is reportPdfFilename (path-safe naming for the vet's
// PIMS filing) and generateVetReport's contract handling (a blank body must SURFACE,
// never render blank — the function always renders designed empty states, so an
// empty response means the call itself failed). The native PDF/print/share path
// (shareReportPdf) is integration, verified on-device; the modules are mocked here
// only so importing pdf.ts doesn't drag native code into jest.

import { reportPdfFilename, generateVetReport, shareReportPdf, type VetReport } from './pdf';
import { supabase } from './supabase';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

jest.mock('./supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));
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
    expect(mockedInvoke).toHaveBeenCalledWith('generate-report', { body: { petId: 'p1' } });
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
      body: { petId: 'p1', startDate: '2026-05-01', endDate: '2026-06-01' },
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
