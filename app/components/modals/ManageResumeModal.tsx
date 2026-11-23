'use client';

import React, { useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function ManageResumeModal() {
  const { showManageResumeModal, setShowManageResumeModal, savedMasterResume, supabase, setSavedMasterResume, setSavedMasterResumeText, setError } = useApp();
  const [masterResumeLoading, setMasterResumeLoading] = useState(false);

  if (!showManageResumeModal) return null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict IDOR prevention: revalidate authenticated user session
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    setMasterResumeLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const parseRes = await fetch('/api/parse-resume', { method: 'POST', body: formData });
      if (!parseRes.ok) throw new Error('Failed to parse resume.');
      const { text } = await parseRes.json();
      const ext = file.name.substring(file.name.lastIndexOf('.'));
      const storagePath = `${currentUser.id}/master_resume${ext}`;
      await supabase.storage.from('resumes').upload(storagePath, file, { upsert: true });
      await supabase.from('users').update({ master_resume_filename: file.name, master_resume_text: text, master_resume_path: storagePath }).eq('id', currentUser.id);
      setSavedMasterResume(file.name);
      setSavedMasterResumeText(text);
      setShowManageResumeModal(false);
    } catch { setError('Failed to save master resume. Please try again.'); } finally { setMasterResumeLoading(false); }
  }

  async function handleRemove() {
    // Strict IDOR prevention: revalidate authenticated user session
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return;

    const { data: ud } = await supabase.from('users').select('master_resume_path').eq('id', currentUser.id).single();
    // Only allow removal if storage path strictly resides in current user's namespace
    if (ud?.master_resume_path && ud.master_resume_path.startsWith(`${currentUser.id}/`)) {
      await supabase.storage.from('resumes').remove([ud.master_resume_path]);
    }
    await supabase.from('users').update({ master_resume_filename: null, master_resume_text: null, master_resume_path: null }).eq('id', currentUser.id);
    setSavedMasterResume(null); setSavedMasterResumeText(null); setShowManageResumeModal(false);
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
          <button onClick={handleRemove} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-red-500 transition-colors">Remove saved resume</button>
        )}
      </div>
    </div>
  );
}
