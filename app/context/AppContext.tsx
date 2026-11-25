'use client';

import React, { createContext, useContext, useCallback } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { UIProvider, useUI } from './UIContext';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { mindfulSteps } from '@/lib/theme';
import type { Generation } from '@/lib/types';

// Export these for direct usage in components
export { useAuth } from './AuthContext';
export { useUI } from './UIContext';
export { useWorkspace } from './WorkspaceContext';

interface AppActions {
  handleLogout: () => Promise<void>;
  handleCraft: () => Promise<void>;
  handleRetry: () => void;
  openArchiveItem: (gen: Generation) => void;
}

const AppActionsContext = createContext<AppActions | null>(null);

export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error('useAppActions must be used within AppProviders');
  return ctx;
}

// Temporary shim to support components that haven't been migrated yet
export function useApp() {
  const auth = useAuth();
  const ui = useUI();
  const workspace = useWorkspace();
  const actions = useAppActions();
  return { ...auth, ...ui, ...workspace, ...actions };
}

function AppActionsProvider({ children }: { children: React.ReactNode }) {
  const { supabase, user, tokens, fetchUserData, setTokens } = useAuth();
  const { setAppState, setCurrentView, setShowLoginModal, setShowPaywall, setError } = useUI();
  const {
    resumeFile, jdText, setResumeFile, setJdText, setActiveTab, setCurrentGeneration,
    setAtsScore, setScoreBefore, setScoreBreakdown, setMatchedKeywords, setMissedKeywords, setScoreLoading, setProcessingStep, setApiResolved,
    lastCraftInputs, setLastCraftInputs
  } = useWorkspace();

  const { savedMasterResumeText } = useAuth();

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    await supabase.auth.signOut();
    setResumeFile(null); setJdText(''); setCurrentView('workspace'); setAppState('desk');
  }, [supabase, setResumeFile, setJdText, setCurrentView, setAppState]);

  const handleCraft = useCallback(async () => {
    if (!user) { setShowLoginModal(true); return; }
    if (tokens <= 0) { setShowPaywall(true); return; }

    setLastCraftInputs({ resumeFile, jdText });
    setError(null); setAppState('mindful'); setProcessingStep(0); setApiResolved(false);
    setAtsScore(null); setScoreBefore(null); setScoreBreakdown(null);
    setMatchedKeywords([]); setMissedKeywords([]);

    let step = 0;
    const interval = setInterval(() => {
      if (step < mindfulSteps.length - 1) {
        step++;
        setProcessingStep(step);
      }
    }, 2600);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s — two parallel Gemini calls

    try {
      let resumeText = '';
      if (resumeFile) {
        const formData = new FormData();
        formData.append('file', resumeFile);
        const parseRes = await fetch('/api/parse-resume', { method: 'POST', body: formData, signal: controller.signal });
        if (!parseRes.ok) {
          const err = await parseRes.json().catch(() => ({}));
          throw new Error(err.error ?? 'Failed to parse resume. Please try again.');
        }
        resumeText = (await parseRes.json()).text;
      } else if (savedMasterResumeText) {
        resumeText = savedMasterResumeText;
      }

      const genRes = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, jobDescription: jdText }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      clearInterval(interval);

      if (genRes.status === 402) { setAppState('desk'); setShowPaywall(true); return; }
      if (!genRes.ok) { const err = await genRes.json(); throw new Error(err.error ?? 'Generation failed. Please try again.'); }

      const data = await genRes.json();
      setCurrentGeneration(data.generation);
      setAtsScore(data.score_after ?? data.ats_score ?? null);
      setScoreBefore(data.score_before ?? null);
      setScoreBreakdown(data.score_breakdown ?? null);
      setMatchedKeywords(data.matched_keywords ?? []);
      setMissedKeywords(data.missed_keywords ?? []);
      setTokens((prev) => Math.max(0, prev - 1));
      if (user) fetchUserData(user.id);

      // Glide smoothly to the final step, let MindfulView fade out calmly, then open ReviewView
      setProcessingStep(mindfulSteps.length - 1);
      setApiResolved(true);
      setTimeout(() => {
        setAppState('review');
        setActiveTab('resume');
      }, 750);
    } catch (err: unknown) {
      clearInterval(interval);
      clearTimeout(timeoutId);
      setApiResolved(false);
      setAppState('desk');
      setScoreBefore(null); setScoreBreakdown(null);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Generation is taking too long. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }
  }, [user, tokens, resumeFile, jdText, savedMasterResumeText, fetchUserData, setShowLoginModal, setShowPaywall, setLastCraftInputs, setError, setAppState, setProcessingStep, setApiResolved, setAtsScore, setScoreBefore, setScoreBreakdown, setMatchedKeywords, setMissedKeywords, setCurrentGeneration, setActiveTab, setTokens]);

  const handleRetry = useCallback(() => {
    if (!lastCraftInputs) return;
    if (lastCraftInputs.resumeFile) setResumeFile(lastCraftInputs.resumeFile);
    setJdText(lastCraftInputs.jdText);
    setError(null);
    setTimeout(() => handleCraft(), 0);
  }, [lastCraftInputs, handleCraft, setResumeFile, setJdText, setError]);

  const openArchiveItem = useCallback((gen: Generation) => {
    setCurrentGeneration(gen);
    setCurrentView('workspace');
    setAppState('review');
    setActiveTab('resume');

    // If scores were already saved with this generation, display them immediately!
    if (gen.ats_score !== undefined && gen.ats_score !== null) {
      setAtsScore(gen.ats_score);
      setScoreBefore(gen.score_before ?? null);
      setScoreBreakdown(gen.score_breakdown ?? null);
      setMatchedKeywords(gen.matched_keywords ?? []);
      setMissedKeywords(gen.missed_keywords ?? []);
      setScoreLoading(false);
      return;
    }

    // Fallback: only for old legacy generations created before score saving
    setAtsScore(null); setScoreBefore(null); setScoreBreakdown(null);
    setMatchedKeywords([]); setMissedKeywords([]);
    setScoreLoading(true);

    // Trigger on-demand scoring for the archived generation
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText: gen.tailored_resume,
        jobDescription: gen.job_description,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.score === 'number') {
          setAtsScore(data.score);
          setScoreBreakdown(data.breakdown ?? null);
          setMatchedKeywords(data.matchedKeywords ?? []);
          setMissedKeywords(data.missedKeywords ?? []);
        } else {
          setAtsScore(null);
        }
      })
      .catch((err) => {
        console.warn('Failed to score archived generation:', err);
        setAtsScore(null);
      })
      .finally(() => {
        setScoreLoading(false);
      });
  }, [setCurrentGeneration, setAtsScore, setScoreBefore, setScoreBreakdown, setMatchedKeywords, setMissedKeywords, setScoreLoading, setCurrentView, setAppState, setActiveTab]);

  return (
    <AppActionsContext.Provider value={{ handleLogout, handleCraft, handleRetry, openArchiveItem }}>
      {children}
    </AppActionsContext.Provider>
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UIProvider>
        <WorkspaceProvider>
          <AppActionsProvider>
            {children}
          </AppActionsProvider>
        </WorkspaceProvider>
      </UIProvider>
    </AuthProvider>
  );
}
