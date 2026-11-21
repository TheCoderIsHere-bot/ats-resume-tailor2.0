'use client';

import React, { useState, useRef } from 'react';
import { FileText, UploadCloud, CheckCircle2, ChevronRight } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function DeskView() {
  const { resumeFile, savedMasterResume, jdText, isReadyToCraft, setResumeFile, setJdText, setError, handleCraft } = useApp();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 animate-gentle max-w-6xl mx-auto w-full">
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#222222]">Your tailored application,<br />crafted effortlessly.</h1>
        <p className={`text-lg ${theme.textSecondary} max-w-xl mx-auto font-medium`}>Provide your core experience and the target role. We&apos;ll find the perfect alignment.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8 w-full">
        <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => { if (!savedMasterResume && !resumeFile) fileInputRef.current?.click(); }}
          className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-6 sm:p-10 flex flex-col items-center justify-center min-h-[260px] sm:min-h-[320px] border-2 transition-all duration-300 group ${isDragging ? 'border-[#8AA694] bg-[#f0fdf4]' : 'border-transparent hover:border-gray-100'} ${!savedMasterResume && !resumeFile ? 'cursor-pointer' : ''}`}>
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
        <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-6 sm:p-10 flex flex-col min-h-[260px] sm:min-h-[320px] border border-transparent hover:border-gray-100 transition-all duration-300`}>
          <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center"><UploadCloud size={18} className="text-gray-500" /></div><h3 className="text-xl font-semibold">Paste the job description</h3></div>
          <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} placeholder="Paste the requirements and responsibilities for the role you are targeting..." className="flex-1 w-full bg-gray-50/50 hover:bg-gray-50 rounded-2xl p-6 text-sm text-[#333333] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8AA694]/20 focus:bg-white resize-none transition-all duration-300 border border-transparent" />
        </div>
      </div>
      <div className={`mt-16 transition-all duration-700 ease-in-out ${isReadyToCraft ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
        <button onClick={handleCraft} className={`flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-4 rounded-full ${theme.accentSage} ${theme.accentSageHover} text-white text-lg font-medium transition-all shadow-lg shadow-[#8AA694]/20 hover:shadow-xl hover:shadow-[#8AA694]/30 hover:-translate-y-1`}>Craft My Application <ChevronRight size={20} /></button>
      </div>
    </div>
  );
}
