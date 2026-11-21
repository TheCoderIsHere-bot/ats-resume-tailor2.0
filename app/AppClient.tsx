'use client';

import { AppProvider, useAuth, useUI, useWorkspace } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';
import { Navbar } from '@/app/components/nav/Navbar';
import { ErrorToast } from '@/app/components/shared/ErrorToast';
import { LandingPage } from '@/app/components/landing/LandingPage';
import { DeskView } from '@/app/components/workspace/DeskView';
import { MindfulView } from '@/app/components/workspace/MindfulView';
import { ReviewView } from '@/app/components/workspace/ReviewView';
import { ArchiveView } from '@/app/components/archive/ArchiveView';
import { LoginModal } from '@/app/components/modals/LoginModal';
import { PaywallModal } from '@/app/components/modals/PaywallModal';
import { ManageResumeModal } from '@/app/components/modals/ManageResumeModal';
import { BillingModal } from '@/app/components/modals/BillingModal';

function AppShell() {
  const { user, authLoading } = useAuth();
  const { appState, currentView, showLoginModal, showPaywall, showManageResumeModal, showBillingModal } = useUI();
  const { currentGeneration } = useWorkspace();

  return (
    <div className={`min-h-screen ${theme.bgApp} ${theme.textPrimary} font-sans selection:bg-[#8AA694]/20`}>
      <Navbar />
      <ErrorToast />

      {authLoading ? (
        <main className="pt-20 min-h-screen" />
      ) : !user ? (
        <LandingPage />
      ) : (
        <main className="pt-20 min-h-screen flex flex-col relative overflow-hidden">
          {currentView === 'archive' && <ArchiveView />}
          {currentView === 'workspace' && (<>
            {appState === 'desk' && <DeskView />}
            {appState === 'mindful' && <MindfulView />}
            {appState === 'review' && currentGeneration && <ReviewView />}
          </>)}
        </main>
      )}

      {showLoginModal && <LoginModal />}
      {showPaywall && <PaywallModal />}
      {showManageResumeModal && <ManageResumeModal />}
      {showBillingModal && <BillingModal />}
    </div>
  );
}

export default function AppClient() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
