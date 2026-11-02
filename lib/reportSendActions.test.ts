// The native hand-offs. The platform modules are mocked; what is asserted is what each one is
// handed and how its answer becomes a `SendResult`.

const mockRelease = jest.fn();
jest.mock('./pdf', () => ({
  renderReportPdf: jest.fn(async () => ({ uri: 'file:///transient/Nyx-Reyes_owner-home-log.pdf', release: mockRelease })),
  shareReportPdf: jest.fn(async () => true),
}));
jest.mock('expo-print', () => ({ printAsync: jest.fn(async () => undefined) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { shareReportPdf, type VetReport } from './pdf';
import { copyEmailText, emailReport, loadMailComposer, mailAvailable, printReport, shareReport } from './reportSendActions';

const report = { html: '<html>report</html>' } as VetReport;

function mailWith(status: string) {
  return {
    isAvailableAsync: jest.fn(async () => true),
    composeAsync: jest.fn(async () => ({ status })),
  } as unknown as typeof import('expo-mail-composer');
}

beforeEach(() => jest.clearAllMocks());

describe('the mail composer is loaded lazily (an old binary has no native module)', () => {
  it('a binary without the module reads as no Mail, never a crash', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mail = loadMailComposer(() => {
      throw new Error("Cannot find native module 'ExpoMailComposer'");
    });
    expect(mail).toBeNull();
    expect(await mailAvailable(mail)).toBe(false);
    expect(await emailReport(report, { subject: 's', body: 'b', documentUris: [] }, mail)).toBe('failed');
  });
});

describe('emailReport', () => {
  it('attaches the named report first, then each vet document the owner switched on', async () => {
    const mail = mailWith('sent');
    await emailReport(report, { subject: 'Nyx · owner’s home log', body: 'Hello,', documentUris: ['file:///doc1.pdf'] }, mail);
    expect(mail.composeAsync).toHaveBeenCalledWith({
      subject: 'Nyx · owner’s home log',
      body: 'Hello,',
      isHtml: false,
      attachments: ['file:///transient/Nyx-Reyes_owner-home-log.pdf', 'file:///doc1.pdf'],
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['sent', 'sent'],
    ['saved', 'saved'],
    ['cancelled', 'cancelled'],
    ['undetermined', 'undetermined'],
    ['something-new', 'undetermined'],
  ])('Mail’s %s reads as %s', async (status, result) => {
    expect(await emailReport(report, { subject: 's', body: 'b', documentUris: [] }, mailWith(status))).toBe(result);
  });

  it('releases the print temp even when Mail throws', async () => {
    const mail = { composeAsync: jest.fn(async () => { throw new Error('boom'); }) } as unknown as typeof import('expo-mail-composer');
    await expect(emailReport(report, { subject: 's', body: 'b', documentUris: [] }, mail)).rejects.toThrow('boom');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe('print, share, copy', () => {
  it('print hands the report’s own HTML to the print sheet', async () => {
    expect(await printReport(report)).toBe('done');
    expect(Print.printAsync).toHaveBeenCalledWith({ html: report.html });
  });

  it('a dismissed print sheet is a cancel: no card', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (Print.printAsync as jest.Mock).mockRejectedValueOnce(new Error('Printing did not complete'));
    expect(await printReport(report)).toBe('cancelled');
  });

  it('share is done, or failed with no share sheet', async () => {
    expect(await shareReport(report)).toBe('done');
    (shareReportPdf as jest.Mock).mockResolvedValueOnce(false);
    expect(await shareReport(report)).toBe('failed');
  });

  it('copy puts the subject over the body on the clipboard', async () => {
    expect(await copyEmailText('Subject', 'Body')).toBe('done');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Subject\n\nBody');
  });
});
