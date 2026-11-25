'use client';

import React, { useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function ManageResumeModal() {
  const {
    showManageResumeModal,
    setShowManageResumeModal,
    savedMasterResume,
    setSavedMasterResume,
    setSavedMasterResumeText,
    setError,
  } = useApp();
  const [masterResumeLoading, setMasterResumeLoading] = useState(false);

  if (!showManageResumeModal) return null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isValidExt = lowerName.endsWith('.pdf') || lowerName.endsWith('.docx');
    const allowedMimes = [
      'application/pdf',
      'application/x-pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '',
    ];
    if (!isValidExt || !allowedMimes.includes(file.type.toLowerCase())) {
      setError('Please upload a valid .pdf or Word (.docx) file.');
      e.target.value = '';
      return;
    }
    if (file.size < 100 || file.size > 5 * 1024 * 1024) {
      setError(file.size < 100 ? 'Uploaded file is empty or corrupted.' : 'File is too large. Maximum size is 5MB.');
      e.target.value = '';
      return;
    }

    setMasterResumeLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/user/master-resume', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save master resume.');

      setSavedMasterResume(data.filename);
      setSavedMasterResumeText(data.text);
      setShowManageResumeModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save master resume. Please try again.');
    } finally {
      setMasterResumeLoading(false);
    }
  }

  async function handleRemove() {
    setMasterResumeLoading(true);
    try {
      const res = await fetch('/api/user/master-resume', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove saved resume.');

      setSavedMasterResume(null);
      setSavedMasterResumeText(null);
      setShowManageResumeModal(false);
    } catch {
      setError('Failed to remove saved resume. Please try again.');
    } finally {
      setMasterResumeLoading(false);
    }
  }

  return (
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
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleUpload} />
        </label>
        {savedMasterResume && (
          <button
            onClick={handleRemove}
            disabled={masterResumeLoading}
            className="mt-4 w-full text-center text-sm text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            Remove saved resume
          </button>
        )}
      </div>
    </div>
  );
}
