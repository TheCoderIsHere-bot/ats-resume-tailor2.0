'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import type { Generation, ActiveTab, CraftInputs, ATSScoreBreakdown } from '@/lib/types';
import { useAuth } from './AuthContext';

export interface WorkspaceContextValue {
  resumeFile: File | null;
  jdText: string;
  activeTab: ActiveTab;
  currentGeneration: Generation | null;
  atsScore: number | null;        // after-tailoring score (new: deterministic)
  scoreBefore: number | null;     // pre-tailoring score
  scoreBreakdown: ATSScoreBreakdown | null; // full breakdown for display
  matchedKeywords: string[];
  missedKeywords: string[];
  scoreLoading: boolean;
  processingStep: number;
  apiResolved: boolean;
  stepAnimKey: number;
  loopCount: number;
  lastCraftInputs: CraftInputs | null;

  resumeReady: boolean;
  isReadyToCraft: boolean;

  setResumeFile: (f: File | null) => void;
  setJdText: (s: string) => void;
  setActiveTab: (t: ActiveTab) => void;
  setCurrentGeneration: (g: Generation | null) => void;
  setAtsScore: (n: number | null) => void;
  setScoreBefore: (n: number | null) => void;
  setScoreBreakdown: (b: ATSScoreBreakdown | null) => void;
  setMatchedKeywords: (kw: string[]) => void;
  setMissedKeywords: (kw: string[]) => void;
  setScoreLoading: (b: boolean) => void;
  setProcessingStep: (n: number) => void;
  setApiResolved: (b: boolean) => void;
  setStepAnimKey: React.Dispatch<React.SetStateAction<number>>;
  setLoopCount: (n: number) => void;
  setLastCraftInputs: (inputs: CraftInputs | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { savedMasterResume } = useAuth(); // Needed for computed properties

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('resume');
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [scoreBefore, setScoreBefore] = useState<number | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ATSScoreBreakdown | null>(null);
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([]);
  const [missedKeywords, setMissedKeywords] = useState<string[]>([]);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [apiResolved, setApiResolved] = useState(false);
  const [stepAnimKey, setStepAnimKey] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const [lastCraftInputs, setLastCraftInputs] = useState<CraftInputs | null>(null);

  const resumeReady = useMemo(() => !!resumeFile || !!savedMasterResume, [resumeFile, savedMasterResume]);
  const isReadyToCraft = useMemo(() => resumeReady && jdText.length > 10, [resumeReady, jdText]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    resumeFile, jdText, activeTab, currentGeneration, atsScore, scoreBefore, scoreBreakdown, matchedKeywords, missedKeywords, scoreLoading, processingStep, apiResolved, stepAnimKey, loopCount, lastCraftInputs,
    resumeReady, isReadyToCraft,
    setResumeFile, setJdText, setActiveTab, setCurrentGeneration, setAtsScore, setScoreBefore, setScoreBreakdown, setMatchedKeywords, setMissedKeywords, setScoreLoading, setProcessingStep, setApiResolved, setStepAnimKey, setLoopCount, setLastCraftInputs
  }), [
    resumeFile, jdText, activeTab, currentGeneration, atsScore, scoreBefore, scoreBreakdown, matchedKeywords, missedKeywords, scoreLoading, processingStep, apiResolved, stepAnimKey, loopCount, lastCraftInputs,
    resumeReady, isReadyToCraft
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
