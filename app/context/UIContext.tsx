'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import type { AppState, CurrentView } from '@/lib/types';

export interface UIContextValue {
  appState: AppState;
  currentView: CurrentView;
  showLoginModal: boolean;
  showPaywall: boolean;
  showManageResumeModal: boolean;
  showBillingModal: boolean;
  showMobileNav: boolean;
  error: string | null;

  setAppState: (s: AppState) => void;
  setCurrentView: (v: CurrentView) => void;
  setShowLoginModal: (b: boolean) => void;
  setShowPaywall: (b: boolean) => void;
  setShowManageResumeModal: (b: boolean) => void;
  setShowBillingModal: (b: boolean) => void;
  setShowMobileNav: (b: boolean) => void;
  setError: (e: string | null) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [appState, setAppState] = useState<AppState>('desk');
  const [currentView, setCurrentView] = useState<CurrentView>('workspace');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showManageResumeModal, setShowManageResumeModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo<UIContextValue>(() => ({
    appState, currentView, showLoginModal, showPaywall, showManageResumeModal, showBillingModal, showMobileNav, error,
    setAppState, setCurrentView, setShowLoginModal, setShowPaywall, setShowManageResumeModal, setShowBillingModal, setShowMobileNav, setError
  }), [appState, currentView, showLoginModal, showPaywall, showManageResumeModal, showBillingModal, showMobileNav, error]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
