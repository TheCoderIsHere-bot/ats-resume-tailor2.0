'use client';

import React, { useState } from 'react';
import { FileText, Mail, UploadCloud, Download, Sparkles, CheckCircle2, Shield, Target } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function LandingPage() {
  const { setShowLoginModal, setError } = useApp();
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);

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

  return (
    <main className="pt-20">
      {/* Hero */}
      <section className="relative pt-24 pb-24 px-6 md:px-8 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
          <div className="w-[500px] h-[500px] rounded-full bg-[#8AA694] mix-blend-multiply filter blur-3xl animate-breathe" />
          <div className="absolute w-[350px] h-[350px] rounded-full bg-[#b8c9bf] mix-blend-multiply filter blur-2xl animate-breathe" style={{ animationDelay: '1.5s' }} />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center animate-gentle">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-[#222222] leading-tight mb-6">Your resume, tailored perfectly for every application</h1>
          <p className="text-lg md:text-xl text-[#6B7280] max-w-2xl mx-auto mb-10 font-medium leading-relaxed">Stop sending the same resume everywhere. Our AI analyzes each job description and rewrites your resume to pass ATS filters and impress recruiters.</p>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <button onClick={() => setShowLoginModal(true)} className={`px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:shadow-[#8AA694]/30 hover:-translate-y-1`}>Get 3 Free Applications</button>
            <p className="text-sm text-gray-400">No credit card required</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 md:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-12">How It Works</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
      <section id="features" className="py-24 px-6 md:px-8 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-4">Features</h2>
          <p className="text-2xl md:text-3xl font-semibold text-center text-[#222222] mb-16 max-w-xl mx-auto">Everything you need to land more interviews</p>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { icon: Target, title: 'ATS-Optimized Output', desc: 'Keywords from the job description are woven into your resume to pass automated screening.' },
              { icon: Mail, title: 'AI Cover Letter', desc: 'A tailored cover letter generated alongside your resume, ready to send.' },
              { icon: Download, title: 'PDF & Word Export', desc: 'Download your tailored resume and cover letter as a polished PDF or an editable Word (.docx) file — ready for any job portal.' },
              { icon: Shield, title: 'Secure & Private', desc: 'Your data is encrypted and never sold or shared with third parties. Only you can access your resume and generated documents.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-5 p-6 rounded-2xl hover:bg-white transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#ecfdf5] flex items-center justify-center flex-shrink-0"><item.icon size={18} className="text-[#8AA694]" /></div>
                <div><h3 className="font-semibold text-[#333333] mb-1">{item.title}</h3><p className="text-sm text-[#6B7280] leading-relaxed">{item.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Email Capture */}
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

      {/* By the Numbers */}
      <section className="py-24 px-6 md:px-8 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase text-center mb-4">By the Numbers</h2>
          <p className="text-2xl md:text-3xl font-semibold text-center text-[#222222] mb-16 max-w-xl mx-auto">Results you can measure</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { stat: '85%+', label: 'Average ATS match score after tailoring', sublabel: 'vs ~40% for untailored resumes' },
              { stat: '< 60s', label: 'Time to parse and analyse your resume', sublabel: 'Instant keyword extraction' },
              { stat: '20+', label: 'JD keywords integrated per application', sublabel: 'Naturally, not stuffed' },
              { stat: '2-in-1', label: 'Tailored resume + cover letter together', sublabel: 'Ready to send immediately' },
            ].map((item) => (
              <div key={item.stat} className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-8 text-center hover:-translate-y-1 transition-all duration-300`}>
                <div className="text-4xl font-bold text-[#8AA694] mb-3">{item.stat}</div>
                <p className="text-sm font-semibold text-[#333333] mb-1">{item.label}</p>
                <p className="text-xs text-gray-400">{item.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 md:px-8">
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-4">Simple Pricing</h2>
          <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-10 border border-gray-100/50`}>
            <div className="text-4xl font-bold text-[#333333] mb-2">{'₹'}250</div>
            <p className="text-sm text-[#6B7280] mb-6">for 10 tailored applications</p>
            <div className="space-y-3 text-left mb-8">
              {['ATS-optimized resume for each application', 'Custom cover letter included', 'PDF & DOCX download for every generation', 'Credits never expire'].map((text) => (
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
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-[#222222] mb-4">Ready to stand out?</h2>
          <p className="text-lg text-[#6B7280] mb-10">Join professionals who land more interviews with AI-tailored applications. Start with 3 free credits.</p>
          <button onClick={() => setShowLoginModal(true)} className={`px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:-translate-y-1`}>Get 3 Free Applications</button>
        </div>
      </section>
      <footer className="py-12 px-6 border-t border-gray-100/50">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full ${theme.accentSage} flex items-center justify-center text-white`}><Sparkles size={12} /></div>
            <span className="font-semibold text-sm tracking-tight text-[#333333]">Tailor.ai</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-400">
            <a href="#how-it-works" className="hover:text-[#333333] transition-colors">How it works</a>
            <a href="#features" className="hover:text-[#333333] transition-colors">Features</a>
            <a href="#pricing" className="hover:text-[#333333] transition-colors">Pricing</a>
            <button onClick={() => setShowLoginModal(true)} className="hover:text-[#333333] transition-colors">Sign up free</button>
          </nav>
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Tailor.ai. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
