'use client';

import React, { useState, useRef, useCallback } from 'react';
import { FileText, Mail, Download, Sparkles, ChevronDown, Pencil, Check, X, Copy } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';
import { markdownToHtml } from '@/lib/markdown';
import { sanitizeResumeHtml } from '@/lib/htmlSanitizer';
import { AtsScoreCard } from './AtsScoreCard';

export function ReviewView() {
  const {
    activeTab, setActiveTab, currentGeneration,
    atsScore, scoreBefore, scoreBreakdown, matchedKeywords, missedKeywords, scoreLoading,
    setAppState, setCurrentGeneration, setAtsScore, setScoreBefore, setScoreBreakdown,
    setMatchedKeywords, setMissedKeywords, setError,
  } = useApp();

  const [downloadDropdown, setDownloadDropdown] = useState<'resume' | 'cover_letter' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Track edited HTML per tab independently
  const [editedResume, setEditedResume] = useState<string | null>(null);
  const [editedCoverLetter, setEditedCoverLetter] = useState<string | null>(null);

  const editRef = useRef<HTMLDivElement>(null);

  const resumeHtml = editedResume ?? (currentGeneration ? markdownToHtml(currentGeneration.tailored_resume, matchedKeywords) : '');
  const coverHtml = editedCoverLetter ?? (currentGeneration ? markdownToHtml(currentGeneration.cover_letter) : '');
  const currentHtml = activeTab === 'resume' ? resumeHtml : coverHtml;

  function startEdit() {
    setIsEditing(true);
    // Give React a tick to render the contenteditable div before focusing
    setTimeout(() => editRef.current?.focus(), 50);
  }

  function saveEdit() {
    if (!editRef.current) return;
    const cleanHtml = sanitizeResumeHtml(editRef.current.innerHTML);
    if (activeTab === 'resume') setEditedResume(cleanHtml);
    else setEditedCoverLetter(cleanHtml);
    setIsEditing(false);
  }

  function cancelEdit() {
    setIsEditing(false);
    // key={`${activeTab}-${isEditing}`} automatically remounts with currentHtml
  }

  const handleCopy = useCallback(() => {
    let textToCopy = '';
    if (editRef.current) {
      textToCopy = editRef.current.innerText;
    } else if (currentGeneration) {
      const rawMd = activeTab === 'resume' ? currentGeneration.tailored_resume : currentGeneration.cover_letter;
      textToCopy = rawMd.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s+/gm, '').replace(/^[-*]\s+/gm, '• ');
    }
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeTab, currentGeneration]);

  const handleDownload = useCallback(async (type: 'resume' | 'cover_letter', format: 'pdf' | 'docx' = 'pdf') => {
    if (!currentGeneration) return;
    try {
      // If user has edited, send the edited HTML for download
      const editedHtml = type === 'resume' ? editedResume : editedCoverLetter;
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: currentGeneration.id, type, format, editedHtml }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = type === 'resume' ? 'tailored_resume' : 'cover_letter';
      a.download = `${baseName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Download failed. Please try again.'); }
  }, [currentGeneration, editedResume, editedCoverLetter, setError]);

  if (!currentGeneration) return null;

  return (
    <div className="flex-1 flex flex-col lg:flex-row max-w-[1600px] w-full mx-auto animate-gentle">
      {/* ── Sidebar ── */}
      <div className="w-72 hidden lg:flex flex-col py-10 pl-8 pr-4 h-[calc(100vh-80px)] sticky top-20">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-4 ml-4">Your Documents</p>
          <nav className="space-y-2">
            <button
              onClick={() => { setActiveTab('resume'); setIsEditing(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${activeTab === 'resume' ? 'bg-white text-[#333333] shadow-sm' : 'text-[#6B7280] hover:bg-white/50'}`}
            >
              <FileText size={18} className={activeTab === 'resume' ? theme.textSage : 'text-gray-400'} />
              Tailored Resume
              {editedResume && <span className="ml-auto w-2 h-2 rounded-full bg-[#8AA694]" title="Edited" />}
            </button>
            <button
              onClick={() => { setActiveTab('cover-letter'); setIsEditing(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${activeTab === 'cover-letter' ? 'bg-white text-[#333333] shadow-sm' : 'text-[#6B7280] hover:bg-white/50'}`}
            >
              <Mail size={18} className={activeTab === 'cover-letter' ? theme.textSage : 'text-gray-400'} />
              Cover Letter
              {editedCoverLetter && <span className="ml-auto w-2 h-2 rounded-full bg-[#8AA694]" title="Edited" />}
            </button>
          </nav>
        </div>

        {/* AI Insights panel */}
        <div className="mt-auto bg-white/50 rounded-3xl p-6 border border-white/60">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1.5 rounded-full bg-[#8AA694]/10">
              <Sparkles size={14} className={theme.textSage} />
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">AI Insights</h4>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                {atsScore !== null
                  ? scoreBefore !== null
                    ? `Match score: ${scoreBefore}% → ${atsScore}% (+${atsScore - scoreBefore}). ${matchedKeywords.length} keywords integrated${missedKeywords.length > 0 ? `, ${missedKeywords.length} gaps identified` : ''}.`
                    : `Scored ${atsScore}% job match. ${matchedKeywords.length} keywords integrated${missedKeywords.length > 0 ? `, ${missedKeywords.length} gaps identified` : ''}.`
                  : 'Your resume has been tailored with keywords from the job description to pass ATS filters.'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile tab bar ── */}
      <div className="lg:hidden w-full px-6 py-4 flex gap-2">
        <button onClick={() => { setActiveTab('resume'); setIsEditing(false); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${activeTab === 'resume' ? 'bg-white shadow-sm text-[#333333]' : 'text-[#6B7280]'}`}>
          Resume {editedResume && '●'}
        </button>
        <button onClick={() => { setActiveTab('cover-letter'); setIsEditing(false); }} className={`flex-1 py-2 rounded-full text-sm font-medium ${activeTab === 'cover-letter' ? 'bg-white shadow-sm text-[#333333]' : 'text-[#6B7280]'}`}>
          Cover Letter {editedCoverLetter && '●'}
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col h-[calc(100vh-80px)]">
        {/* Header — outside scroll so dropdowns don't clip */}
        <div className="px-4 sm:px-6 lg:px-10 pt-4 sm:pt-6 lg:pt-8 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            {/* Top row: back button + download buttons */}
            <div className="flex justify-between items-start gap-4 flex-wrap mb-3">
              <button
                onClick={() => { setAppState('desk'); setCurrentGeneration(null); setAtsScore(null); setScoreBefore(null); setScoreBreakdown(null); setMatchedKeywords([]); setMissedKeywords([]); }}
                className="text-sm text-gray-500 hover:text-[#333333] transition-colors mt-1"
              >
                ← New application
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Edit / Save / Cancel / Copy */}
                {!isEditing ? (
                  <>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-gray-200 text-[#555] text-sm font-medium hover:bg-gray-50 transition-all"
                      title="Copy text to clipboard"
                    >
                      {copied ? <Check size={14} className="text-[#8AA694]" /> : <Copy size={14} />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-200 text-[#555] text-sm font-medium hover:bg-gray-50 transition-all"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={cancelEdit} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-all">
                      <X size={14} /> Cancel
                    </button>
                    <button onClick={saveEdit} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full ${theme.accentSage} text-white text-sm font-medium transition-all`}>
                      <Check size={14} /> Save edits
                    </button>
                  </>
                )}

                {/* Resume download dropdown */}
                <div className="relative">
                  <button onClick={() => setDownloadDropdown(downloadDropdown === 'resume' ? null : 'resume')} className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-sm font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5`}>
                    <Download size={16} />
                    <span className="hidden sm:inline">Resume</span>
                    <span className="sm:hidden">CV</span>
                    <ChevronDown size={14} className={`transition-transform ${downloadDropdown === 'resume' ? 'rotate-180' : ''}`} />
                  </button>
                  {downloadDropdown === 'resume' && (<>
                    <div className="fixed inset-0 z-40" onClick={() => setDownloadDropdown(null)} />
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-menu">
                      <button onClick={() => { handleDownload('resume', 'pdf'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><Download size={14} className="text-gray-400" /> Download PDF</button>
                      <button onClick={() => { handleDownload('resume', 'docx'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><FileText size={14} className="text-gray-400" /> Download DOCX</button>
                    </div>
                  </>)}
                </div>

                {/* Cover letter download dropdown */}
                <div className="relative">
                  <button onClick={() => setDownloadDropdown(downloadDropdown === 'cover_letter' ? null : 'cover_letter')} className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 text-[#444444] text-sm font-medium transition-all">
                    <Download size={16} />
                    <span className="hidden sm:inline">Cover Letter</span>
                    <span className="sm:hidden">CL</span>
                    <ChevronDown size={14} className={`transition-transform ${downloadDropdown === 'cover_letter' ? 'rotate-180' : ''}`} />
                  </button>
                  {downloadDropdown === 'cover_letter' && (<>
                    <div className="fixed inset-0 z-40" onClick={() => setDownloadDropdown(null)} />
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-menu">
                      <button onClick={() => { handleDownload('cover_letter', 'pdf'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><Download size={14} className="text-gray-400" /> Download PDF</button>
                      <button onClick={() => { handleDownload('cover_letter', 'docx'); setDownloadDropdown(null); }} className="w-full text-left px-4 py-2.5 text-sm text-[#333333] hover:bg-gray-50 flex items-center gap-3 transition-colors"><FileText size={14} className="text-gray-400" /> Download DOCX</button>
                    </div>
                  </>)}
                </div>
              </div>
            </div>

            {/* Job title + company — shown if available */}
            {(currentGeneration.job_title || currentGeneration.company_name) && (
              <div className="flex items-center gap-2 flex-wrap pb-1">
                {currentGeneration.job_title && (
                  <span className="text-sm font-semibold text-[#333333]">{currentGeneration.job_title}</span>
                )}
                {currentGeneration.job_title && currentGeneration.company_name && (
                  <span className="text-gray-300">·</span>
                )}
                {currentGeneration.company_name && (
                  <span className="text-sm text-[#6B7280]">{currentGeneration.company_name}</span>
                )}
                {isEditing ? (
                  <span className="ml-2 text-xs text-[#8AA694] font-medium">● Editing mode — click any text to change it</span>
                ) : activeTab === 'resume' ? (
                  <span className="ml-auto text-xs text-[#1C4B35] bg-[#EAF5EF] border border-[#CFE6D8] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8AA694]"></span>
                    Green highlights show tailored tweaks & keywords
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10 pt-6 pb-4 sm:pb-6 lg:pb-10">
          <AtsScoreCard
            atsScore={atsScore}
            scoreBefore={scoreBefore ?? null}
            scoreBreakdown={scoreBreakdown}
            matchedKeywords={matchedKeywords}
            missedKeywords={missedKeywords}
            isLoading={scoreLoading}
          />
          <div className={`max-w-4xl mx-auto bg-white ${theme.roundedSoft} ${theme.shadowSoft} p-6 sm:p-10 md:p-16 min-h-full relative`}>
            {isEditing && (
              <div className="absolute top-4 right-4 text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                Editing
              </div>
            )}
            <div
              ref={editRef}
              key={`${activeTab}-${isEditing}`}
              contentEditable={isEditing}
              suppressContentEditableWarning
              className={`animate-gentle outline-none ${isEditing ? 'ring-2 ring-[#8AA694]/20 rounded-2xl p-2 -m-2' : ''}`}
              // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml
              dangerouslySetInnerHTML={{ __html: currentHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
