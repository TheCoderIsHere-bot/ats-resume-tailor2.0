'use client';

import React, { useState, useRef, useEffect } from 'react';
import { User, X, AlertCircle } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function LoginModal() {
  const { showLoginModal, setShowLoginModal } = useApp();
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const mountedAtRef = useRef<number>(0);

  useEffect(() => {
    if (showLoginModal) {
      mountedAtRef.current = Date.now();
    }
  }, [showLoginModal]);

  if (!showLoginModal) return null;

  async function handleGoogleLogin() {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const res = await fetch('/api/auth/oauth/google', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setAuthError(data.error || 'Failed to initiate Google sign in. Please try again.');
        return;
      }
      window.location.assign(data.url);
    } catch {
      setAuthError('Failed to initiate Google sign in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const email = (e.target as HTMLFormElement).email.value.trim();
    if (!email) return;

    setMagicLinkSent(false);
    setMagicLinkLoading(true);

    try {
      // Call secure server endpoint with rate limiting & anti-bot honeypot/timing validation
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          _hp: honeypot,
          _ts: mountedAtRef.current,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Failed to send magic link.');
        return;
      }

      setMagicLinkSent(true);
    } catch {
      setAuthError('Connection error. Please try again later.');
    } finally {
      setMagicLinkLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm"
        onClick={() => { setShowLoginModal(false); setMagicLinkSent(false); setAuthError(null); }}
      />
      <div className="relative w-full max-w-[420px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle text-center">
        <button
          onClick={() => { setShowLoginModal(false); setAuthError(null); }}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className={`w-16 h-16 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center mx-auto mb-6`}>
          <User size={28} className={theme.textSage} />
        </div>

        <h2 className="text-2xl font-semibold mb-3">Save your progress.</h2>
        <p className={`text-[15px] ${theme.textSecondary} leading-relaxed mb-6`}>
          Log in or create an account to securely store your master resume and craft your first free application.
        </p>

        {authError && (
          <div className="mb-5 p-3.5 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-2.5 text-left text-xs text-red-700 animate-gentle">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <span className="leading-snug">{authError}</span>
          </div>
        )}

        {magicLinkSent ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-4">{'\uD83D\uDCE7'}</div>
            <p className="font-medium text-[#333333] mb-2">Check your email!</p>
            <p className="text-sm text-gray-500">We sent a secure magic link to your inbox. Click it to sign in.</p>
            <button
              onClick={() => { setMagicLinkSent(false); setAuthError(null); }}
              className="mt-6 text-sm underline text-gray-400 hover:text-gray-600 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
              {/* Hidden anti-bot honeypot field — invisible to humans */}
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="auth-website">Website</label>
                <input
                  id="auth-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="your@email.com"
                onChange={() => setAuthError(null)}
                className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-[#333333] text-sm outline-none focus:border-[#8AA694] transition-colors"
              />
              <button
                type="submit"
                disabled={magicLinkLoading || googleLoading}
                className="w-full py-3.5 rounded-2xl bg-[#8AA694] hover:bg-[#7a9684] text-white font-medium transition-all disabled:opacity-60"
              >
                {magicLinkLoading ? 'Sending\u2026' : 'Send Magic Link'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading || magicLinkLoading}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border border-gray-200 text-[#333333] font-medium transition-all shadow-sm hover:bg-gray-50 text-sm disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {googleLoading ? 'Connecting\u2026' : 'Continue with Google'}
            </button>
          </>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">By continuing, you agree to our Terms &amp; Privacy Policy</p>
      </div>
    </div>
  );
}
