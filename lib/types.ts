export interface Generation {
  id: string;
  job_description: string;
  tailored_resume: string;
  cover_letter: string;
  created_at: string;
  job_title?: string;
  company_name?: string;
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
