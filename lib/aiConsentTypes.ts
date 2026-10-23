// The owner's AI consent answer as the phone holds it (CUL-1834). Its own module, apart from
// `lib/aiConsent.ts` (the reader AND writer), so a surface that only RENDERS by the answer
// imports no writer: Home's write guard (`guards/homeWrites.test.ts`) walks every import,
// type-only ones included, and Home writes no consent (CUL-1174).
export interface AiConsentRow {
  granted: boolean;
  copyVersion: string;
  source: string;
  decidedAt: string;
}
