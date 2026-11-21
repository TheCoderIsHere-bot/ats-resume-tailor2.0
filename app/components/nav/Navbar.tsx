'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Menu, User, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';
import { ProfileMenu } from './ProfileMenu';
import { MobileNav } from './MobileNav';

export function Navbar() {
  const {
    user, authLoading, tokens, appState, currentView,
    showMobileNav, setShowMobileNav,
    setAppState, setCurrentView, setShowLoginModal, setShowPaywall, setShowManageResumeModal, setShowBillingModal,
    fetchUserData, fetchTransactions, handleLogout,
  } = useApp();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLandingMenu, setShowLandingMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Scroll-aware border — fades in after user scrolls 20px
  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile menu when clicking anywhere outside it
  useEffect(() => {
    if (!showProfileMenu) return;
    function handleOutsideClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showProfileMenu]);

  // Smooth scroll helper for landing anchor links
  function scrollTo(id: string) {
    setShowLandingMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  const isLanding = !user && !authLoading;

  return (
    <>
      <nav className={`fixed top-0 w-full bg-[#F7F7F9]/80 backdrop-blur-lg z-40 transition-all duration-300 ${scrolled ? 'border-b border-gray-200/70 shadow-sm' : 'border-b border-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-20 flex justify-between items-center">
          {/* Left — logo + nav links */}
          <div className="flex items-center gap-8">
            <div onClick={() => { setCurrentView('workspace'); setAppState('desk'); setShowLandingMenu(false); }} className="flex items-center gap-3 cursor-pointer">
              <div className={`w-8 h-8 rounded-full ${theme.accentSage} flex items-center justify-center text-white shadow-sm`}><Sparkles size={16} /></div>
              <span className="font-semibold text-lg tracking-tight">Tailor.ai</span>
            </div>

            {/* Authenticated nav */}
            {user && (
              <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <button onClick={() => { setCurrentView('workspace'); if (appState === 'review') setAppState('desk'); }} className={`transition-colors ${currentView === 'workspace' ? 'text-[#333333]' : 'text-[#6B7280] hover:text-[#333333]'}`}>Workspace</button>
                <button onClick={() => { setCurrentView('archive'); fetchUserData(user.id); }} className={`transition-colors ${currentView === 'archive' ? 'text-[#333333]' : 'text-[#6B7280] hover:text-[#333333]'}`}>My Archive</button>
              </div>
            )}

            {/* Landing desktop nav — only when not logged in */}
            {isLanding && (
              <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <button onClick={() => scrollTo('how-it-works')} className="text-[#6B7280] hover:text-[#333333] transition-colors">How it works</button>
                <button onClick={() => scrollTo('features')} className="text-[#6B7280] hover:text-[#333333] transition-colors">Features</button>
                <button onClick={() => scrollTo('pricing')} className="text-[#333333] font-semibold hover:text-[#8AA694] transition-colors">Pricing</button>
              </div>
            )}
          </div>

          {/* Right — auth buttons or user menu */}
          <div className="flex items-center gap-3 md:gap-6 relative">
            {isLanding ? (
              <>
                <button onClick={() => setShowLoginModal(true)} className={`hidden sm:block text-sm font-medium ${theme.textSecondary} hover:text-[#333333] transition-colors`}>Log in</button>
                <button onClick={() => setShowLoginModal(true)} className={`px-4 sm:px-5 py-2.5 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-sm font-medium transition-all shadow-sm`}>Sign up free</button>
                {/* Mobile hamburger for landing nav */}
                <button onClick={() => setShowLandingMenu(!showLandingMenu)} className="md:hidden p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Menu">
                  {showLandingMenu ? <X size={20} /> : <Menu size={20} />}
                </button>
              </>
            ) : user ? (
              <>
                <button onClick={() => setShowPaywall(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ecfdf5] border border-[#d1fae5] text-[#065f46] text-sm font-medium transition-transform hover:scale-105">{'✨'} {tokens} Token{tokens !== 1 ? 's' : ''}</button>
                <div className="relative" ref={profileRef}>
                  <button onClick={() => { setShowProfileMenu(!showProfileMenu); setShowMobileNav(false); }} className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#8AA694] transition-all flex items-center justify-center text-gray-500 hover:bg-gray-300">
                    {user.user_metadata?.avatar_url ? <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <User size={20} />}
                  </button>
                  <ProfileMenu
                    user={user}
                    showProfileMenu={showProfileMenu}
                    setShowProfileMenu={setShowProfileMenu}
                    onManageResume={() => { setShowManageResumeModal(true); setShowProfileMenu(false); }}
                    onBilling={() => { fetchTransactions(); setShowBillingModal(true); setShowProfileMenu(false); }}
                    onLogout={handleLogout}
                  />
                </div>
                <button onClick={() => { setShowMobileNav(!showMobileNav); setShowProfileMenu(false); }} className="md:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"><Menu size={20} /></button>
              </>
            ) : null}
          </div>
        </div>

        {/* Landing mobile menu drawer */}
        {isLanding && showLandingMenu && (
          <div className="md:hidden border-t border-gray-100 bg-[#F7F7F9]/95 backdrop-blur-lg px-6 py-4 flex flex-col gap-1 animate-gentle">
            <button onClick={() => scrollTo('how-it-works')} className="text-left py-3 text-sm font-medium text-[#6B7280] hover:text-[#333333] border-b border-gray-100/80 transition-colors">How it works</button>
            <button onClick={() => scrollTo('features')} className="text-left py-3 text-sm font-medium text-[#6B7280] hover:text-[#333333] border-b border-gray-100/80 transition-colors">Features</button>
            <button onClick={() => scrollTo('pricing')} className="text-left py-3 text-sm font-semibold text-[#333333] border-b border-gray-100/80 transition-colors">Pricing</button>
            <button onClick={() => { setShowLoginModal(true); setShowLandingMenu(false); }} className="text-left py-3 text-sm font-medium text-[#6B7280] hover:text-[#333333] transition-colors">Log in</button>
          </div>
        )}
      </nav>

      {showMobileNav && user && (
        <MobileNav
          onWorkspace={() => { setCurrentView('workspace'); if (appState === 'review') setAppState('desk'); setShowMobileNav(false); }}
          onArchive={() => { setCurrentView('archive'); if (user) fetchUserData(user.id); setShowMobileNav(false); }}
          onLogout={() => { handleLogout(); setShowMobileNav(false); }}
          onClose={() => setShowMobileNav(false)}
        />
      )}
    </>
  );
}


