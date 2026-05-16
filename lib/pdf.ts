import { supabase } from './supabase';

interface ReportParams {
  petId: string;
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string;   // YYYY-MM-DD
}

interface ReportResult {
  shareToken: string;
  shareUrl: string;   // Signed Supabase Storage URL valid for 30 days
  storagePath: string;
}

export async function generateVetReport(params: ReportParams): Promise<ReportResult> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: params,
  });

  if (error) throw new Error(`Report generation failed: ${error.message}`);
  if (!data?.share_url) throw new Error('Invalid response from report function');

  return {
    shareToken: data.share_token,
    shareUrl: data.share_url,
    storagePath: data.storage_path,
  };
}
