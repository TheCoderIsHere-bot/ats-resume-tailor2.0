export interface ATSScoreBreakdown {
  requiredMatched: string[];
  requiredMissed: string[];
  preferredMatched: string[];
  preferredMissed: string[];
  requiredScore: number;   // 0–70 points
  preferredScore: number;  // 0–20 points
  bonusScore: number;      // 0–10 points
  total: number;           // 0–100
}

export interface Generation {
  id: string;
  job_description: string;
  tailored_resume: string;
  cover_letter: string;
  created_at: string;
  job_title?: string;
  company_name?: string;
  ats_score?: number | null;
  score_before?: number | null;
  score_breakdown?: ATSScoreBreakdown | null;
  matched_keywords?: string[];
  missed_keywords?: string[];
}

export interface Transaction {
  id: string;
  amount_inr: number;
  tokens_added: number;
  created_at: string;
}

export type AppState = 'desk' | 'mindful' | 'review';
export type CurrentView = 'workspace' | 'archive';
export type ActiveTab = 'resume' | 'cover-letter';

export interface CraftInputs {
  resumeFile: File | null;
  jdText: string;
}
