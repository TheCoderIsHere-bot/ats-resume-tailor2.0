'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { Generation, Transaction } from '@/lib/types';

const supabase = createClient();

export interface AuthContextValue {
  supabase: typeof supabase;
  user: SupabaseUser | null;
  tokens: number;
  authLoading: boolean;
  savedMasterResume: string | null;
  savedMasterResumeText: string | null;
  generations: Generation[];
  transactions: Transaction[];
  setTokens: React.Dispatch<React.SetStateAction<number>>;
  setSavedMasterResume: (s: string | null) => void;
  setSavedMasterResumeText: (s: string | null) => void;
  setGenerations: React.Dispatch<React.SetStateAction<Generation[]>>;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  fetchUserData: (userId: string) => Promise<void>;
  fetchTransactions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [tokens, setTokens] = useState(0);
  const [savedMasterResume, setSavedMasterResume] = useState<string | null>(null);
  const [savedMasterResumeText, setSavedMasterResumeText] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchUserData = useCallback(async (_userId?: string) => {
    void _userId; // Always resolved server-side from verified HTTP cookie session
    try {
      const res = await fetch('/api/user/data', { method: 'GET', cache: 'no-store' });
      if (!res.ok) return;
      const { userData, generations: genData } = await res.json();
      if (userData) {
        setTokens(userData.tokens_balance ?? 0);
        setSavedMasterResume(userData.master_resume_filename ?? null);
        setSavedMasterResumeText(userData.master_resume_text ?? null);
      }
      if (genData) setGenerations(genData as Generation[]);
    } catch {
      // Fail gracefully on transient network issues
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/user/transactions', { method: 'GET', cache: 'no-store' });
      if (!res.ok) return;
      const { transactions: txData } = await res.json();
      if (txData) setTransactions(txData);
    } catch {
      // Fail gracefully on transient network issues
    }
  }, [user]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => {
      setUser(data.user);
      if (data.user) fetchUserData(data.user.id);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: SupabaseUser | null } | null) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setTokens(0);
        setSavedMasterResume(null);
        setSavedMasterResumeText(null);
        setGenerations([]);
        setTransactions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const value = useMemo<AuthContextValue>(() => ({
    supabase, user, tokens, authLoading, savedMasterResume, savedMasterResumeText, generations, transactions,
    setTokens, setSavedMasterResume, setSavedMasterResumeText, setGenerations, setTransactions,
    fetchUserData, fetchTransactions
  }), [
    user, tokens, authLoading, savedMasterResume, savedMasterResumeText, generations, transactions,
    fetchUserData, fetchTransactions
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
