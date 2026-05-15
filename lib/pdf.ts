import { supabase } from './supabase';

interface ReportParams {
  petId: string;
  dateRangeStart: string; // ISO date string
  dateRangeEnd: string;
}

interface ReportResult {
  shareToken: string;
  shareUrl: string;
  storagePath: string;
}

export async function generateVetReport(params: ReportParams): Promise<ReportResult> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: params,
  });

  if (error) throw new Error(`Report generation failed: ${error.message}`);

  return {
    shareToken: data.share_token,
    shareUrl: `https://nyx.app/report/${data.share_token}`,
    storagePath: data.storage_path,
  };
}
