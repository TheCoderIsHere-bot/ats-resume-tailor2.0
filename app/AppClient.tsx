'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Mail, UploadCloud, Download,
  Sparkles, X, ChevronRight, ChevronDown, CheckCircle2, CreditCard,
  User, LogOut, History, File, Shield, Target,
  Menu, Search, RotateCcw, SkipForward
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Generation {
  id: string;
  job_description: string;
  tailored_resume: string;
  cover_letter: string;
  created_at: string;
  job_title?: string;
  company_name?: string;
}

// ─── Theme constants ───────────────────────────────────────────────────────────
const theme = {
  bgApp: 'bg-[#F7F7F9]',
  bgSurface: 'bg-white',
  textPrimary: 'text-[#333333]',
  textSecondary: 'text-[#6B7280]',
  accentSage: 'bg-[#8AA694]',
  textSage: 'text-[#8AA694]',
  accentSageHover: 'hover:bg-[#789382]',
  highlightMint: 'bg-[#ecfdf5] text-[#065f46]',
  shadowSoft: 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
  roundedSoft: 'rounded-3xl',
};

const mindfulSteps = [
  'Reading your experience...',
  'Finding the perfect intersections with the role...',
  'Refining your professional summary...',
  'Drafting a thoughtful cover letter...',
  'Polishing the final details...',
];

// ── Markdown → safe HTML helper ───────────────────────────────────────────────
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  const raw = markdown
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-[#222222] mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-semibold tracking-tight text-[#111111] mb-4 text-center">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#222222]">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-2 text-[15px]"><span class="text-gray-300 mt-1">\u2022</span><span>$1</span></li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul class="space-y-2 mb-4">${m}</ul>`)
    .replace(/^---$/gm, '<hr class="border-gray-100 my-6" />')
    .replace(/^(?!<[hul]|<hr|<li)(.+)$/gm, '<p class="text-[15px] text-[#444444] leading-relaxed mb-3">$1</p>')
    .replace(/\n\n/g, '');
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['class'] });
}

export default function AppClient() {
  const supabase = createClient();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [appState, setAppState] = useState<'desk' | 'mindful' | 'review'>('desk');
  const [currentView, setCurrentView] = useState<'workspace' | 'archive'>('workspace');

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [tokens, setTokens] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showManageResumeModal, setShowManageResumeModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [transactions, setTransactions] = useState<{ id: string; amount_inr: number; tokens_added: number; created_at: string }[]>([]);
  const [savedMasterResume, setSavedMasterResume] = useState<string | null>(null);
  const [savedMasterResumeText, setSavedMasterResumeText] = useState<string | null>(null);
  const [masterResumeLoading, setMasterResumeLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Input state ─────────────────────────────────────────────────────────────
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState('');
  const [activeTab, setActiveTab] = useState<'resume' | 'cover-letter'>('resume');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Processing / result state ───────────────────────────────────────────────
  const [processingStep, setProcessingStep] = useState(0);
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generations, setGenerations] = useState<Generation[]>([]);

  // ── ATS score state (Feature 1) ─────────────────────────────────────────────
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([]);

  // ── Loading skip state (Feature 2) ──────────────────────────────────────────
  const [apiResolved, setApiResolved] = useState(false);
  const [stepAnimKey, setStepAnimKey] = useState(0);

  // ── Mobile nav state (Feature 4) ────────────────────────────────────────────
  const [showMobileNav, setShowMobileNav] = useState(false);

  // ── Email capture state (Feature 5) ─────────────────────────────────────────
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);

  // ── Archive search state (Feature 6) ────────────────────────────────────────
  const [archiveSearch, setArchiveSearch] = useState('');

  // ── Error retry state (Feature 7) ───────────────────────────────────────────
  const [lastCraftInputs, setLastCraftInputs] = useState<{ resumeFile: File | null; jdText: string } | null>(null);

  // ── Download dropdown state ─────────────────────────────────────────────────
  const [downloadDropdown, setDownloadDropdown] = useState<'resume' | 'cover_letter' | null>(null);

  // ── Effects ─────────────────────────────────────────────────────────────────
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
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchUserData(userId: string) {
    const [{ data: userData }, { data: genData }] = await Promise.all([
      supabase.from('users').select('tokens_balance, master_resume_filename, master_resume_text').eq('id', userId).single(),
      supabase.from('generations').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (userData) {
      setTokens(userData.tokens_balance ?? 0);
      setSavedMasterResume(userData.master_resume_filename ?? null);
      setSavedMasterResumeText(userData.master_resume_text ?? null);
    }
    if (genData) setGenerations(genData as Generation[]);
  }

  async function fetchTransactions() {
    if (!user) return;
    const { data } = await supabase
      .from('transactions')
      .select('id, amount_inr, tokens_added, created_at')
      .eq('user_id', user.id)
      .eq('status', 'Success')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setTransactions(data);
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const resumeReady = !!resumeFile || !!savedMasterResume;
  const isReadyToCraft = resumeReady && jdText.length > 10;

  const filteredGenerations = generations.filter((gen) => {
    if (!archiveSearch.trim()) return true;
    const q = archiveSearch.toLowerCase();
    return (
      (gen.job_title ?? '').toLowerCase().includes(q) ||
      (gen.company_name ?? '').toLowerCase().includes(q) ||
      gen.job_description.toLowerCase().includes(q)
    );
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleGoogleLogin() {
    const result = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (result && 'error' in result && result.error) {
      alert('Sign in error: ' + result.error.message);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const email = (e.target as HTMLFormElement).email.value.trim();
    if (!email) return;
    setMagicLinkSent(false);
    setMagicLinkLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setMagicLinkLoading(false);
    if (error) { alert('Error: ' + error.message); return; }
    setMagicLinkSent(true);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null); setTokens(0); setSavedMasterResume(null); setSavedMasterResumeText(null);
    setResumeFile(null); setGenerations([]); setCurrentView('workspace'); setAppState('desk');
    setJdText(''); setShowProfileMenu(false);
  }

  function handleFileSelect(file: File) {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) { setError('Please upload a PDF or Word (.docx) file.'); return; }
    setResumeFile(file); setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function handleCraft() {
    if (!user) { setShowLoginModal(true); return; }
    if (tokens <= 0) { setShowPaywall(true); return; }

    // Save inputs for retry (Feature 7)
    setLastCraftInputs({ resumeFile, jdText });
    setError(null); setAppState('mindful'); setProcessingStep(0); setApiResolved(false);
    setAtsScore(null); setMatchedKeywords([]); setStepAnimKey(0);

    // Steps 0-3 play at 2500ms. Step 4 ("Polishing the final details...") is reserved
    // for when API responds, so the output follows immediately after it.
    let step = 0;
    let apiDone = false;
    const interval = setInterval(() => {
      step++;
      if (step < mindfulSteps.length - 1) {
        // Advance through steps 0-3 normally
        setProcessingStep(step);
      } else if (apiDone) {
        // API is done — show final step, then transition to review
        clearInterval(interval);
        setProcessingStep(mindfulSteps.length - 1);
        setTimeout(() => { setAppState('review'); setActiveTab('resume'); }, 2000);
      } else {
        // Waiting for API — re-trigger step 3 to keep text visible
        step = mindfulSteps.length - 2;
        setStepAnimKey(prev => prev + 1);
      }
    }, 2500);

    // Timeout via AbortController (Feature 7)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      let resumeText = '';
      if (resumeFile) {
        const formData = new FormData();
        formData.append('file', resumeFile);
        const parseRes = await fetch('/api/parse-resume', { method: 'POST', body: formData, signal: controller.signal });
        if (!parseRes.ok) throw new Error('Failed to parse resume. Please try again.');
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

      if (genRes.status === 402) { clearInterval(interval); setAppState('desk'); setShowPaywall(true); return; }
      if (!genRes.ok) { const err = await genRes.json(); throw new Error(err.error ?? 'Generation failed. Please try again.'); }

      const data = await genRes.json();
      setCurrentGeneration(data.generation);
      setAtsScore(data.ats_score ?? null);
      setMatchedKeywords(data.matched_keywords ?? []);
      setTokens((prev) => Math.max(0, prev - 1));
      if (user) fetchUserData(user.id);

      // Signal API done — the interval will show step 4 on its next tick
      apiDone = true;
      setApiResolved(true);
    } catch (err: unknown) {
      clearInterval(interval);
      clearTimeout(timeoutId);
      setAppState('desk');
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Generation is taking too long. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }
  }

  function handleRetry() {
    if (!lastCraftInputs) return;
    if (lastCraftInputs.resumeFile) setResumeFile(lastCraftInputs.resumeFile);
    setJdText(lastCraftInputs.jdText);
    setError(null);
    setTimeout(() => handleCraft(), 0);
  }

  function handleSkipMindful() {
    if (apiResolved && currentGeneration) {
      setAppState('review');
      setActiveTab('resume');
    }
  }

  async function handleLeadCapture(e: React.FormEvent) {
    e.preventDefault();
    if (!leadEmail || leadLoading) return;
    setLeadLoading(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: leadEmail }),
      });
      if (res.ok) {
        setLeadSubmitted(true);
      } else {
        setError('Could not save your email. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLeadLoading(false);
    }
  }

  async function handleDownload(type: 'resume' | 'cover_letter', format: 'pdf' | 'docx' = 'pdf') {
    if (!currentGeneration) return;
    try {
      const res = await fetch('/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generationId: currentGeneration.id, type, format }) });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const baseName = type === 'resume' ? 'tailored_resume' : 'cover_letter';
      a.download = `${baseName}.${format}`;
      a.click(); URL.revokeObjectURL(url);
    } catch { setError('Download failed. Please try again.'); }
  }

  async function handleRazorpayCheckout() {
    try {
      const orderRes = await fetch('/api/payment/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: 10 }) });
      const order = await orderRes.json();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      document.head.appendChild(script);
      script.onload = () => {
        const options = { key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, amount: order.amount, currency: order.currency, name: 'Tailor.ai', description: '10 Application Credits', order_id: order.id,
          handler: () => { setTimeout(() => user && fetchUserData(user.id), 3000); setShowPaywall(false); },
          prefill: { email: user?.email ?? '' }, theme: { color: '#8AA694' } };
        // @ts-expect-error Razorpay loaded via CDN
        new window.Razorpay(options).open();
      };
    } catch { setError('Could not open payment. Please try again.'); }
  }

  function openArchiveItem(gen: Generation) { setCurrentGeneration(gen); setAtsScore(null); setMatchedKeywords([]); setCurrentView('workspace'); setAppState('review'); setActiveTab('resume'); }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${theme.bgApp} ${theme.textPrimary} font-sans selection:bg-[#8AA694]/20`}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');.font-sans{font-family:'Plus Jakarta Sans',sans-serif}@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.15);opacity:.6}}.animate-breathe{animation:breathe 5s ease-in-out infinite}@keyframes gentleFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.animate-gentle{animation:gentleFade .6s ease-out forwards}@keyframes textFade{0%{opacity:0;filter:blur(4px)}20%{opacity:1;filter:blur(0)}80%{opacity:1;filter:blur(0)}100%{opacity:0;filter:blur(4px)}}.animate-text-fade{animation:textFade 2.5s ease-in-out forwards}@keyframes textHold{0%{opacity:0;filter:blur(4px)}30%{opacity:1;filter:blur(0)}100%{opacity:1;filter:blur(0)}}.animate-text-hold{animation:textHold 1s ease-out forwards}@keyframes skipAppear{from{opacity:0}to{opacity:1}}.animate-skip-appear{animation:skipAppear .5s ease-out 3s forwards}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#E5E7EB;border-radius:10px}::-webkit-scrollbar-thumb:hover{background:#D1D5DB}` }} />

      {/* NAV */}
      <nav className="fixed top-0 w-full bg-[#F7F7F9]/80 backdrop-blur-lg z-40 border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-20 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div onClick={() => { setCurrentView('workspace'); setAppState('desk'); }} className="flex items-center gap-3 cursor-pointer">
              <div className={`w-8 h-8 rounded-full ${theme.accentSage} flex items-center justify-center text-white shadow-sm`}><Sparkles size={16} /></div>
              <span className="font-semibold text-lg tracking-tight">Tailor.ai</span>
            </div>
            {user && (
              <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <button onClick={() => { setCurrentView('workspace'); if (appState === 'review') setAppState('desk'); }} className={`transition-colors ${currentView === 'workspace' ? 'text-[#333333]' : 'text-[#6B7280] hover:text-[#333333]'}`}>Workspace</button>
                <button onClick={() => { setCurrentView('archive'); fetchUserData(user.id); }} className={`transition-colors ${currentView === 'archive' ? 'text-[#333333]' : 'text-[#6B7280] hover:text-[#333333]'}`}>My Archive</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 md:gap-6 relative">
            {!user && !authLoading ? (
              <>
                <button onClick={() => setShowLoginModal(true)} className={`text-sm font-medium ${theme.textSecondary} hover:text-[#333333] transition-colors`}>Log in</button>
                <button onClick={() => setShowLoginModal(true)} className={`px-5 py-2.5 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-sm font-medium transition-all shadow-sm`}>Sign up free</button>
              </>
            ) : user ? (
              <>
                {/* Mobile hamburger (Feature 4) */}
                <button onClick={() => setShowMobileNav(!showMobileNav)} className="md:hidden p-2 rounded-full hover:bg-gray-100 transition-colors"><Menu size={20} /></button>
                <button onClick={() => setShowPaywall(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ecfdf5] border border-[#d1fae5] text-[#065f46] text-sm font-medium transition-transform hover:scale-105">{'\u2728'} {tokens} Token{tokens !== 1 ? 's' : ''}</button>
                <div className="relative">
                  <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-10 h-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#8AA694] transition-all flex items-center justify-center text-gray-500 hover:bg-gray-300">
                    {user.user_metadata?.avatar_url ? <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <User size={20} />}
                  </button>
                  {showProfileMenu && (<>
                    <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] border border-gray-100 py-2 z-50 animate-gentle">
                      <div className="px-4 py-3 border-b border-gray-100 mb-2">
                        <p className="text-sm font-semibold text-[#333333]">{user.user_metadata?.full_name ?? 'User'}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <button onClick={() => { setShowManageResumeModal(true); setShowProfileMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-[#444444] hover:bg-gray-50 flex items-center gap-3 transition-colors"><File size={16} className="text-gray-400" /> Manage Master Resume</button>
                      <button onClick={() => { fetchTransactions(); setShowBillingModal(true); setShowProfileMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm text-[#444444] hover:bg-gray-50 flex items-center gap-3 transition-colors"><CreditCard size={16} className="text-gray-400" /> Billing History</button>
                      <div className="h-px bg-gray-100 my-2" />
                      <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><LogOut size={16} /> Log Out</button>
                    </div>
                  </>)}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Mobile nav dropdown (Feature 4) */}
      {showMobileNav && user && (<>
        <div className="fixed inset-0 z-30" onClick={() => setShowMobileNav(false)} />
        <div className="fixed top-20 left-0 right-0 z-35 bg-white border-b border-gray-100 shadow-lg animate-gentle md:hidden">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
            <button onClick={() => { setCurrentView('workspace'); if (appState === 'review') setAppState('desk'); setShowMobileNav(false); }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Workspace</button>
            <button onClick={() => { setCurrentView('archive'); if (user) fetchUserData(user.id); setShowMobileNav(false); }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">My Archive</button>
            <button onClick={() => { setShowManageResumeModal(true); setShowMobileNav(false); }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-3"><File size={16} className="text-gray-400" /> Manage Master Resume</button>
            <button onClick={() => { setShowPaywall(true); setShowMobileNav(false); }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-3"><CreditCard size={16} className="text-gray-400" /> Buy Tokens</button>
            <div className="h-px bg-gray-100 my-1" />
            <button onClick={() => { handleLogout(); setShowMobileNav(false); }} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"><LogOut size={16} /> Log Out</button>
          </div>
        </div>
      </>)}

      {/* Error toast with retry (Feature 7) */}
      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-2xl text-sm font-medium shadow-md flex items-center gap-3 animate-gentle max-w-[90vw]">
          <span className="flex-1">{error}</span>
          {lastCraftInputs && (
            <button onClick={() => { setError(null); handleRetry(); }} className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition-colors flex-shrink-0"><RotateCcw size={12} /> Retry</button>
          )}
          <button onClick={() => { setError(null); setLastCraftInputs(null); }} className="flex-shrink-0"><X size={16} /></button>
        </div>
      )}

      {authLoading ? <main className="pt-20 min-h-screen" /> : !user ? (
        /* LANDING PAGE */
        <main className="pt-20">
          {/* Hero */}
          <section className="relative pt-24 pb-24 px-6 md:px-8 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
              <div className="w-[500px] h-[500px] rounded-full bg-[#8AA694] mix-blend-multiply filter blur-3xl animate-breathe" />
              <div className="absolute w-[350px] h-[350px] rounded-full bg-[#b8c9bf] mix-blend-multiply filter blur-2xl animate-breathe" style={{ animationDelay: '1.5s' }} />
            </div>
            <div className="relative z-10 max-w-3xl mx-auto text-center animate-gentle">
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-[#222222] leading-tight mb-6">Your resume, tailored perfectly for every application</h1>
              <p className="text-lg md:text-xl text-[#6B7280] max-w-2xl mx-auto mb-10 font-medium leading-relaxed">Stop sending the same resume everywhere. Our AI analyzes each job description and rewrites your resume to pass ATS filters and impress recruiters.</p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
                <button onClick={() => setShowLoginModal(true)} className={`px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:shadow-[#8AA694]/30 hover:-translate-y-1`}>Get 3 Free Applications</button>
                <p className="text-sm text-gray-400">No credit card required</p>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className="py-24 px-6 md:px-8">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-12">How It Works</h2>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { icon: UploadCloud, step: '01', title: 'Upload your resume', desc: 'Drop your master resume in PDF or Word format. We extract and understand your experience.' },
                  { icon: FileText, step: '02', title: 'Paste the job description', desc: 'Copy the target role requirements. Our AI identifies the exact keywords and skills needed.' },
                  { icon: Sparkles, step: '03', title: 'Get your tailored application', desc: 'Receive a perfectly aligned resume and cover letter, optimized to pass ATS filters.' },
                ].map((item) => (
                  <div key={item.step} className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-8 hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-100`}>
                    <div className="w-12 h-12 rounded-full bg-[#ecfdf5] flex items-center justify-center mb-6"><item.icon size={22} className="text-[#8AA694]" /></div>
                    <span className="text-xs font-bold text-gray-300 tracking-wider">{item.step}</span>
                    <h3 className="text-xl font-semibold text-[#333333] mt-2 mb-3">{item.title}</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Before / After Sample */}
          <section className="py-24 px-6 md:px-8 bg-white/50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-4">See The Difference</h2>
              <p className="text-2xl md:text-3xl font-semibold text-center text-[#222222] mb-16 max-w-2xl mx-auto">From generic to perfectly targeted</p>
              <div className="grid md:grid-cols-2 gap-8">
                {/* Before */}
                <div className="relative">
                  <div className="absolute -top-4 left-6 px-4 py-1.5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold uppercase tracking-wider z-10">Before</div>
                  <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-8 pt-10 border-2 border-gray-100 opacity-70`}>
                    <h3 className="text-lg font-bold text-[#333333] mb-1 text-center">Alex Johnson</h3>
                    <p className="text-xs text-gray-400 text-center mb-4">Software Developer</p>
                    <hr className="border-gray-100 mb-4" />
                    <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">Experience</p>
                    <p className="text-sm font-semibold text-[#333333]">Full Stack Developer at TechCorp</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-[#444444]">
                      <li className="flex items-start gap-2"><span className="text-gray-300 mt-0.5">{'\u2022'}</span><span>Worked on various web applications using different technologies</span></li>
                      <li className="flex items-start gap-2"><span className="text-gray-300 mt-0.5">{'\u2022'}</span><span>Helped improve website performance</span></li>
                      <li className="flex items-start gap-2"><span className="text-gray-300 mt-0.5">{'\u2022'}</span><span>Collaborated with team members on projects</span></li>
                    </ul>
                    <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mt-5 mb-2">Skills</p>
                    <p className="text-sm text-[#444444]">JavaScript, React, Node.js, Python, SQL, Git</p>
                  </div>
                </div>
                {/* After */}
                <div className="relative">
                  <div className="absolute -top-4 left-6 px-4 py-1.5 rounded-full bg-[#8AA694] text-white text-xs font-bold uppercase tracking-wider z-10">After</div>
                  <div className={`${theme.bgSurface} ${theme.roundedSoft} p-8 pt-10 border-2 border-[#8AA694]/30 shadow-[0_8px_30px_rgb(138,166,148,0.12)]`}>
                    <h3 className="text-lg font-bold text-[#333333] mb-1 text-center">Alex Johnson</h3>
                    <p className="text-xs text-gray-400 text-center mb-4">Senior Frontend Engineer | React & TypeScript Specialist</p>
                    <hr className="border-gray-100 mb-4" />
                    <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">Experience</p>
                    <p className="text-sm font-semibold text-[#333333]">Full Stack Developer at TechCorp</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-[#444444]">
                      <li className="flex items-start gap-2"><span className="text-[#8AA694] mt-0.5">{'\u2022'}</span><span>Architected and shipped <strong className="text-[#222]">3 customer-facing React/TypeScript applications</strong> serving 15K+ daily active users</span></li>
                      <li className="flex items-start gap-2"><span className="text-[#8AA694] mt-0.5">{'\u2022'}</span><span>Optimized Core Web Vitals, <strong className="text-[#222]">reducing LCP from 4.2s to 1.8s</strong> through code splitting and lazy loading</span></li>
                      <li className="flex items-start gap-2"><span className="text-[#8AA694] mt-0.5">{'\u2022'}</span><span>Led cross-functional sprints with design and backend teams using <strong className="text-[#222]">Agile/Scrum methodology</strong></span></li>
                    </ul>
                    <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mt-5 mb-2">Skills</p>
                    <p className="text-sm text-[#444444]"><strong className="text-[#222]">React, TypeScript, Next.js</strong>, Node.js, REST APIs, PostgreSQL, CI/CD, Git</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-sm text-gray-400 mt-8">Same experience. Same person. Dramatically better presentation.</p>
            </div>
          </section>

          {/* Features */}
          <section className="py-24 px-6 md:px-8 bg-white/50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-4">Features</h2>
              <p className="text-2xl md:text-3xl font-semibold text-center text-[#222222] mb-16 max-w-xl mx-auto">Everything you need to land more interviews</p>
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  { icon: Target, title: 'ATS-Optimized Output', desc: 'Keywords from the job description are woven into your resume to pass automated screening.' },
                  { icon: Mail, title: 'AI Cover Letter', desc: 'A tailored cover letter generated alongside your resume, ready to send.' },
                  { icon: Download, title: 'PDF Download', desc: 'Clean, professional PDF output you can submit directly to any job portal.' },
                  { icon: Shield, title: 'Secure & Private', desc: "Your data is encrypted and never shared. We don't store resumes longer than needed." },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-5 p-6 rounded-2xl hover:bg-white transition-colors">
                    <div className="w-10 h-10 rounded-full bg-[#ecfdf5] flex items-center justify-center flex-shrink-0"><item.icon size={18} className="text-[#8AA694]" /></div>
                    <div><h3 className="font-semibold text-[#333333] mb-1">{item.title}</h3><p className="text-sm text-[#6B7280] leading-relaxed">{item.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Email Capture (Feature 5) */}
          <section className="py-20 px-6 md:px-8">
            <div className="max-w-lg mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-semibold text-[#222222] mb-4">Not ready to sign up yet?</h2>
              <p className="text-sm text-[#6B7280] mb-8 leading-relaxed">Drop your email and we{'\u2019'}ll send you a free sample tailored resume so you can see the difference.</p>
              {leadSubmitted ? (
                <div className="bg-[#ecfdf5] text-[#065f46] rounded-2xl p-6 text-sm font-medium animate-gentle">
                  <CheckCircle2 size={24} className="mx-auto mb-3 text-[#8AA694]" />
                  Thank you! We{'\u2019'}ll be in touch shortly.
                </div>
              ) : (
                <form onSubmit={handleLeadCapture} className="flex flex-col sm:flex-row gap-3">
                  <input type="email" required value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder="your@email.com" className="flex-1 px-5 py-3.5 rounded-2xl border border-gray-200 text-[#333333] text-sm outline-none focus:border-[#8AA694] transition-colors" />
                  <button type="submit" disabled={leadLoading} className={`px-8 py-3.5 rounded-2xl ${theme.accentSage} ${theme.accentSageHover} text-white text-sm font-medium transition-all shadow-sm disabled:opacity-60`}>{leadLoading ? 'Sending\u2026' : 'Get Sample'}</button>
                </form>
              )}
            </div>
          </section>

          {/* Pricing */}
          <section className="py-24 px-6 md:px-8">
            <div className="max-w-md mx-auto text-center">
              <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-4">Simple Pricing</h2>
              <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-10 border border-gray-100/50`}>
                <div className="text-4xl font-bold text-[#333333] mb-2">{'\u20B9'}250</div>
                <p className="text-sm text-[#6B7280] mb-6">for 10 tailored applications</p>
                <div className="space-y-3 text-left mb-8">
                  {['ATS-optimized resume for each application', 'Custom cover letter included', 'PDF download for every generation', 'Credits never expire'].map((text) => (
                    <div key={text} className="flex items-center gap-3 text-sm text-[#444444]"><CheckCircle2 size={16} className="text-[#8AA694] flex-shrink-0" />{text}</div>
                  ))}
                </div>
                <button onClick={() => setShowLoginModal(true)} className={`w-full py-4 rounded-2xl ${theme.accentSage} ${theme.accentSageHover} text-white font-medium transition-all shadow-md shadow-[#8AA694]/20`}>Start Tailoring</button>
                <p className="text-xs text-gray-400 mt-4">3 free applications on signup. No credit card required.</p>
              </div>
            </div>
          </section>

          {/* Footer CTA */}
          <section className="py-24 px-6 md:px-8">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-semibold text-[#222222] mb-4">Ready to stand out?</h2>
              <p className="text-lg text-[#6B7280] mb-10">Join professionals who land more interviews with AI-tailored applications. Start with 3 free credits.</p>
              <button onClick={() => setShowLoginModal(true)} className={`px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:-translate-y-1`}>Get 3 Free Applications</button>
            </div>
          </section>
          <footer className="py-8 px-6 border-t border-gray-100/50 text-center"><p className="text-sm text-gray-400">{'\u00A9'} {new Date().getFullYear()} Tailor.ai. All rights reserved.</p></footer>
        </main>
      ) : (
        /* AUTHENTICATED APP */
        <main className="pt-20 min-h-screen flex flex-col relative overflow-hidden">
          {currentView === 'archive' && (
            <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 animate-gentle">
              <div className="mb-10"><h1 className="text-3xl font-semibold tracking-tight text-[#222222] mb-2">My Archive</h1><p className={`text-sm ${theme.textSecondary}`}>Review and download your past applications.</p></div>

              {/* Archive search (Feature 6) */}
              {generations.length > 0 && (
                <div className="relative mb-6">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Search by job title, company, or description..." className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-sm text-[#333333] placeholder-gray-400 focus:outline-none focus:border-[#8AA694] transition-colors" />
                </div>
              )}

              {generations.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-24 ${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} text-center`}><FileText size={40} className="text-gray-300 mb-4" strokeWidth={1.5} /><p className="font-semibold text-[#333333] mb-1">No applications yet</p><p className="text-sm text-gray-400">Craft your first tailored application to see it here.</p></div>
              ) : filteredGenerations.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-24 ${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} text-center`}><Search size={40} className="text-gray-300 mb-4" strokeWidth={1.5} /><p className="font-semibold text-[#333333] mb-1">No results found</p><p className="text-sm text-gray-400">Try a different search term.</p></div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredGenerations.map((gen) => (
                    <div key={gen.id} className={`flex flex-col md:flex-row md:items-center justify-between p-6 ${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} border border-transparent hover:border-gray-100 transition-all duration-300`}>
                      <div className="mb-4 md:mb-0">
                        <h3 className="text-lg font-semibold text-[#333333] mb-1">
                          {gen.job_title && gen.company_name ? `${gen.job_title} \u2014 ${gen.company_name}` : gen.job_title ?? `${gen.job_description.slice(0, 70)}\u2026`}
                        </h3>
                        {gen.job_title && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{gen.job_description.slice(0, 100)}</p>}
                        <span className="text-sm text-gray-500">{new Date(gen.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <button onClick={() => openArchiveItem(gen)} className="self-start md:self-auto px-6 py-2.5 rounded-full bg-gray-50 hover:bg-gray-100 text-[#444444] text-sm font-medium transition-colors">View & Download</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentView === 'workspace' && (<>
            {appState === 'desk' && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 animate-gentle max-w-6xl mx-auto w-full">
                <div className="text-center mb-16 space-y-4">
                  <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#222222]">Your tailored application,<br />crafted effortlessly.</h1>
                  <p className={`text-lg ${theme.textSecondary} max-w-xl mx-auto font-medium`}>Provide your core experience and the target role. We&apos;ll find the perfect alignment.</p>
                </div>
                <div className="grid md:grid-cols-2 gap-8 w-full">
                  <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => { if (!savedMasterResume && !resumeFile) fileInputRef.current?.click(); }}
                    className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-10 flex flex-col items-center justify-center min-h-[320px] border-2 transition-all duration-300 group ${isDragging ? 'border-[#8AA694] bg-[#f0fdf4]' : 'border-transparent hover:border-gray-100'} ${!savedMasterResume && !resumeFile ? 'cursor-pointer' : ''}`}>
                    <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
                    {savedMasterResume && !resumeFile ? (
                      <div className="flex flex-col items-center animate-gentle w-full text-center">
                        <div className="w-20 h-20 rounded-full bg-[#f0fdf4] flex items-center justify-center mb-6"><CheckCircle2 size={36} className="text-[#15803d]" /></div>
                        <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 justify-center"><FileText size={20} className="text-[#15803d]" />{savedMasterResume}</h3>
                        <p className={`text-sm ${theme.textSecondary} mb-6`}>(Saved Master Asset)</p>
                        <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-4 transition-colors">Replace with new file</button>
                      </div>
                    ) : resumeFile ? (
                      <div className="flex flex-col items-center animate-gentle">
                        <div className="w-20 h-20 rounded-full bg-[#f0fdf4] flex items-center justify-center mb-6"><CheckCircle2 size={36} className="text-[#15803d]" /></div>
                        <h3 className="text-xl font-semibold mb-2">Resume Ready</h3>
                        <p className={`text-sm ${theme.textSecondary} mb-4`}>{resumeFile.name}</p>
                        <button onClick={(e) => { e.stopPropagation(); setResumeFile(null); }} className="text-sm font-medium text-gray-500 hover:text-gray-800 underline decoration-gray-300 underline-offset-4 transition-colors">Remove</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-500"><FileText size={32} className="text-gray-400" strokeWidth={1.5} /></div>
                        <h3 className="text-xl font-semibold mb-3">Drop your master resume here</h3>
                        <p className={`text-sm ${theme.textSecondary}`}>Supports PDF or Word documents.</p>
                      </div>
                    )}
                  </div>
                  <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-10 flex flex-col min-h-[320px] border border-transparent hover:border-gray-100 transition-all duration-300`}>
                    <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center"><UploadCloud size={18} className="text-gray-500" /></div><h3 className="text-xl font-semibold">Paste the job description</h3></div>
                    <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the requirements and responsibilities for the role you are targeting..." className="flex-1 w-full bg-gray-50/50 hover:bg-gray-50 rounded-2xl p-6 text-sm text-[#333333] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8AA694]/20 focus:bg-white resize-none transition-all duration-300 border border-transparent" />
                  </div>
                </div>
                <div className={`mt-16 transition-all duration-700 ease-in-out ${isReadyToCraft ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
                  <button onClick={handleCraft} className={`flex items-center gap-3 px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:shadow-[#8AA694]/30 hover:-translate-y-1`}>Craft My Application <ChevronRight size={20} /></button>
                </div>
              </div>
            )}

            {/* Mindful animation with skip button (Feature 2) */}
            {appState === 'mindful' && (
              <div className="flex-1 flex flex-col items-center justify-center relative animate-gentle">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-64 h-64 rounded-full bg-[#8AA694] mix-blend-multiply filter blur-3xl animate-breathe" /><div className="absolute w-48 h-48 rounded-full bg-[#b8c9bf] mix-blend-multiply filter blur-2xl animate-breathe" style={{ animationDelay: '1s' }} /></div>
                <div className="relative z-10 text-center h-24 flex items-center justify-center"><h2 key={`${processingStep}-${stepAnimKey}`} className={`text-2xl md:text-3xl font-medium text-[#444444] ${processingStep === mindfulSteps.length - 1 ? 'animate-text-hold' : 'animate-text-fade'}`}>{mindfulSteps[processingStep]}</h2></div>
                <button onClick={handleSkipMindful} className="fixed bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors opacity-0 animate-skip-appear"><SkipForward size={16} /> Skip animation</button>
              </div>
            )}

            {appState === 'review' && currentGeneration && (
              <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto animate-gentle">
                <div className="w-72 hidden md:flex flex-col py-10 pl-8 pr-4 h-[calc(100vh-80px)] sticky top-20">
                  <div className="mb-8">
                    <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-4 ml-4">Your Documents</p>
                    <nav className="space-y-2">
                      <button onClick={() => setActiveTab('resume')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${activeTab === 'resume' ? 'bg-white text-[#333333] shadow-sm' : 'text-[#6B7280] hover:bg-white/50'}`}><FileText size={18} className={activeTab === 'resume' ? theme.textSage : 'text-gray-400'} /> Tailored Resume</button>
                      <button onClick={() => setActiveTab('cover-letter')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${activeTab === 'cover-letter' ? 'bg-white text-[#333333] shadow-sm' : 'text-[#6B7280] hover:bg-white/50'}`}><Mail size={18} className={activeTab === 'cover-letter' ? theme.textSage : 'text-gray-400'} /> Cover Letter</button>
                    </nav>
                  </div>
                  <div className="mt-auto bg-white/50 rounded-3xl p-6 border border-white/60"><div className="flex items-start gap-3"><div className="mt-1 p-1.5 rounded-full bg-[#8AA694]/10"><Sparkles size={14} className={theme.textSage} /></div><div><h4 className="text-sm font-semibold mb-1">AI Insights</h4><p className="text-xs text-[#6B7280] leading-relaxed">{atsScore !== null ? `Your resume scored ${atsScore}% ATS match with ${matchedKeywords.length} keywords integrated.` : 'Your resume has been tailored with keywords from the job description to pass ATS filters.'}</p></div></div></div>
                </div>
                <div className="md:hidden w-full px-6 py-4 flex gap-2">
                  <button onClick={() => setActiveTab('resume')} className={`flex-1 py-2 rounded-full text-sm font-medium ${activeTab === 'resume' ? 'bg-white shadow-sm text-[#333333]' : 'text-[#6B7280]'}`}>Resume</button>
                  <button onClick={() => setActiveTab('cover-letter')} className={`flex-1 py-2 rounded-full text-sm font-medium ${activeTab === 'cover-letter' ? 'bg-white shadow-sm text-[#333333]' : 'text-[#6B7280]'}`}>Cover Letter</button>
                </div>
                <div className="flex-1 p-6 md:p-10 h-[calc(100vh-80px)] overflow-y-auto">
                  <div className="max-w-4xl mx-auto flex justify-between items-center mb-6 gap-4 flex-wrap">
                    <button onClick={() => { setAppState('desk'); setCurrentGeneration(null); setAtsScore(null); setMatchedKeywords([]); }} className="text-sm text-gray-500 hover:text-[#333333] transition-colors">{'\u2190'} New application</button>
                    <div className="flex gap-3 flex-wrap">
                      {/* Resume download dropdown */}
                      <div className="relative">
                        <button onClick={() => setDownloadDropdown(downloadDropdown === 'resume' ? null : 'resume')} className={`flex items-center gap-2 px-5 py-2.5 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-sm font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5`}><Download size={16} /> Resume <ChevronDown size={14} className={`transition-transform ${downloadDropdown === 'resume' ? 'rotate-180' : ''}`} /></button>
                        {downloadDropdown === 'resume' && (<>
                          <div className="fixed inset-0 z-40" onClick={() => setDownloadDropdown(null)} />
                          <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-gentle">
                            <button onClick={() => { handleDownload('resume', 'pdf'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><Download size={14} className="text-gray-400" /> Download PDF</button>
                            <button onClick={() => { handleDownload('resume', 'docx'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><FileText size={14} className="text-gray-400" /> Download DOCX</button>
                          </div>
                        </>)}
                      </div>
                      {/* Cover letter download dropdown */}
                      <div className="relative">
                        <button onClick={() => setDownloadDropdown(downloadDropdown === 'cover_letter' ? null : 'cover_letter')} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 text-[#444444] text-sm font-medium transition-all"><Download size={16} /> Cover Letter <ChevronDown size={14} className={`transition-transform ${downloadDropdown === 'cover_letter' ? 'rotate-180' : ''}`} /></button>
                        {downloadDropdown === 'cover_letter' && (<>
                          <div className="fixed inset-0 z-40" onClick={() => setDownloadDropdown(null)} />
                          <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-gentle">
                            <button onClick={() => { handleDownload('cover_letter', 'pdf'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><Download size={14} className="text-gray-400" /> Download PDF</button>
                            <button onClick={() => { handleDownload('cover_letter', 'docx'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><FileText size={14} className="text-gray-400" /> Download DOCX</button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  </div>

                  {/* ATS Score Card (Feature 1) */}
                  {atsScore !== null && (
                    <div className="max-w-4xl mx-auto mb-6">
                      <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-6 flex flex-col sm:flex-row items-center gap-6`}>
                        <div className="relative w-20 h-20 flex-shrink-0">
                          <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="35" fill="none" stroke="#E5E7EB" strokeWidth="6" />
                            <circle cx="40" cy="40" r="35" fill="none" stroke={atsScore >= 80 ? '#8AA694' : atsScore >= 60 ? '#F59E0B' : '#EF4444'} strokeWidth="6" strokeDasharray={`${(atsScore / 100) * 220} 220`} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center"><span className="text-lg font-bold text-[#333333]">{atsScore}%</span></div>
                        </div>
                        <div className="text-center sm:text-left">
                          <h3 className="text-lg font-semibold text-[#333333] mb-1">ATS Match Score</h3>
                          <p className="text-sm text-[#6B7280] mb-3">{atsScore >= 80 ? 'Excellent match! Your resume is well-aligned with this role.' : atsScore >= 60 ? 'Good match. Consider adding more relevant experience details.' : 'Moderate match. The role may require skills not on your resume.'}</p>
                          {matchedKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {matchedKeywords.slice(0, 12).map((kw) => (
                                <span key={kw} className="px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#065f46] text-xs font-medium">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`max-w-4xl mx-auto bg-white ${theme.roundedSoft} ${theme.shadowSoft} p-10 md:p-16 min-h-full`}>
                    {activeTab === 'resume' ? <div className="animate-gentle" dangerouslySetInnerHTML={{ __html: markdownToHtml(currentGeneration.tailored_resume) }} /> : <div className="animate-gentle" dangerouslySetInnerHTML={{ __html: markdownToHtml(currentGeneration.cover_letter) }} />}
                  </div>
                </div>
              </div>
            )}
          </>)}
        </main>
      )}

      {/* MODALS */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm" onClick={() => { setShowLoginModal(false); setMagicLinkSent(false); }} />
          <div className="relative w-full max-w-[420px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle text-center">
            <button onClick={() => setShowLoginModal(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"><X size={20} /></button>
            <div className={`w-16 h-16 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center mx-auto mb-6`}><User size={28} className={theme.textSage} /></div>
            <h2 className="text-2xl font-semibold mb-3">Save your progress.</h2>
            <p className={`text-[15px] ${theme.textSecondary} leading-relaxed mb-8`}>Log in or create an account to securely store your master resume and craft your first free application.</p>
            {magicLinkSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-4">{'\uD83D\uDCE7'}</div>
                <p className="font-medium text-[#333333] mb-2">Check your email!</p>
                <p className="text-sm text-gray-500">We sent a magic link to your inbox. Click it to sign in.</p>
                <button onClick={() => setMagicLinkSent(false)} className="mt-6 text-sm underline text-gray-400">Use a different email</button>
              </div>
            ) : (<>
              <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
                <input name="email" type="email" required placeholder="your@email.com" className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-[#333333] text-sm outline-none focus:border-[#8AA694] transition-colors" />
                <button type="submit" disabled={magicLinkLoading} className="w-full py-3.5 rounded-2xl bg-[#8AA694] hover:bg-[#7a9684] text-white font-medium transition-all disabled:opacity-60">{magicLinkLoading ? 'Sending\u2026' : 'Send Magic Link'}</button>
              </form>
              <div className="flex items-center gap-3 my-4"><div className="flex-1 h-px bg-gray-100" /><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-100" /></div>
              <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border border-gray-200 text-[#333333] font-medium transition-all shadow-sm hover:bg-gray-50 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Continue with Google
              </button>
            </>)}
            <p className="text-center text-xs text-gray-400 mt-6">By continuing, you agree to our Terms & Privacy Policy</p>
          </div>
        </div>
      )}

      {showPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm" onClick={() => setShowPaywall(false)} />
          <div className="relative w-full max-w-[480px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle">
            <button onClick={() => setShowPaywall(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"><X size={20} /></button>
            <div className="text-center mb-8">
              <div className={`w-16 h-16 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center mx-auto mb-6`}><FileText size={28} className={theme.textSage} /></div>
              <h2 className="text-2xl font-semibold mb-3">Get more credits</h2>
              <p className={`text-[15px] ${theme.textSecondary} leading-relaxed`}>{tokens === 0 ? "You've used all your credits." : `You have ${tokens} credit${tokens !== 1 ? 's' : ''} remaining.`} Invest in your job search to craft more tailored applications.</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100/50"><div className="flex justify-between items-center mb-1"><span className="font-semibold text-[#333333]">Aura Pro Bundle</span><span className="text-2xl font-bold text-[#333333]">{'\u20B9'}250</span></div><p className="text-sm text-gray-500">10 AI-crafted applications</p></div>
            <button onClick={handleRazorpayCheckout} className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl ${theme.accentSage} ${theme.accentSageHover} text-white font-medium transition-all shadow-md shadow-[#8AA694]/20 hover:shadow-lg hover:-translate-y-0.5`}><CreditCard size={18} /> Proceed to Checkout</button>
            <p className="text-center text-xs text-gray-400 mt-6">Secured by Razorpay</p>
          </div>
        </div>
      )}

      {showManageResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm" onClick={() => setShowManageResumeModal(false)} />
          <div className="relative w-full max-w-[480px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle">
            <button onClick={() => setShowManageResumeModal(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"><X size={20} /></button>
            <h2 className="text-2xl font-semibold mb-2">Manage Master Resume</h2>
            <p className={`text-[15px] ${theme.textSecondary} mb-8`}>Update the default resume used for your applications.</p>
            <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100/50 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center`}><FileText size={20} className={theme.textSage} /></div>
              <div><p className="font-semibold text-[#333333]">{savedMasterResume ?? 'No resume saved'}</p>{savedMasterResume && <p className="text-sm text-gray-500 mt-0.5">Saved to your profile</p>}</div>
            </div>
            <label className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl border border-gray-200 text-[#333333] font-medium transition-all shadow-sm hover:bg-gray-50 ${masterResumeLoading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
              <UploadCloud size={18} /> {masterResumeLoading ? 'Parsing & Saving\u2026' : 'Upload New File'}
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !user) return;
                setMasterResumeLoading(true);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const parseRes = await fetch('/api/parse-resume', { method: 'POST', body: formData });
                  if (!parseRes.ok) throw new Error('Failed to parse resume.');
                  const { text } = await parseRes.json();
                  const ext = file.name.substring(file.name.lastIndexOf('.'));
                  const storagePath = `${user.id}/master_resume${ext}`;
                  await supabase.storage.from('resumes').upload(storagePath, file, { upsert: true });
                  await supabase.from('users').update({ master_resume_filename: file.name, master_resume_text: text, master_resume_path: storagePath }).eq('id', user.id);
                  setSavedMasterResume(file.name);
                  setSavedMasterResumeText(text);
                  setShowManageResumeModal(false);
                } catch { setError('Failed to save master resume. Please try again.'); } finally { setMasterResumeLoading(false); }
              }} />
            </label>
            {savedMasterResume && (
              <button onClick={async () => {
                if (!user) return;
                const { data: ud } = await supabase.from('users').select('master_resume_path').eq('id', user.id).single();
                if (ud?.master_resume_path) await supabase.storage.from('resumes').remove([ud.master_resume_path]);
                await supabase.from('users').update({ master_resume_filename: null, master_resume_text: null, master_resume_path: null }).eq('id', user.id);
                setSavedMasterResume(null); setSavedMasterResumeText(null); setShowManageResumeModal(false);
              }} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-red-500 transition-colors">Remove saved resume</button>
            )}
          </div>
        </div>
      )}

      {showBillingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm" onClick={() => setShowBillingModal(false)} />
          <div className="relative w-full max-w-[480px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle">
            <button onClick={() => setShowBillingModal(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"><X size={20} /></button>
            <div className="flex items-center gap-3 mb-8"><div className={`w-10 h-10 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center`}><History size={18} className={theme.textSage} /></div><h2 className="text-2xl font-semibold">Billing History</h2></div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {transactions.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No transactions yet.</p> : transactions.map((tx) => (
                <div key={tx.id} className="bg-gray-50 rounded-2xl p-5 border border-gray-100/50 flex justify-between items-center">
                  <div><p className="font-medium text-[#333333]">{tx.tokens_added} Application Credits</p><p className="text-sm text-gray-500 mt-0.5">{new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
                  <div className="text-right"><span className="font-semibold text-[#333333]">{'\u20B9'}{tx.amount_inr}</span><p className="text-xs text-[#065f46] bg-[#ecfdf5] px-2 py-0.5 rounded-full mt-1 inline-block">Paid</p></div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowBillingModal(false)} className="mt-6 w-full py-3.5 rounded-2xl bg-gray-100 text-[#444444] font-medium hover:bg-gray-200 transition-colors">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
