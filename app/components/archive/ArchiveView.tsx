'use client';

import React, { useState, useMemo } from 'react';
import { FileText, Search } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function ArchiveView() {
  const { generations, openArchiveItem } = useApp();
  const [archiveSearch, setArchiveSearch] = useState('');

  const filteredGenerations = useMemo(() => {
    return generations.filter((gen) => {
      if (!archiveSearch.trim()) return true;
      const q = archiveSearch.toLowerCase();
      return (
        (gen.job_title ?? '').toLowerCase().includes(q) ||
        (gen.company_name ?? '').toLowerCase().includes(q) ||
        gen.job_description.toLowerCase().includes(q)
      );
    });
  }, [generations, archiveSearch]);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 animate-gentle">
      <div className="mb-10"><h1 className="text-3xl font-semibold tracking-tight text-[#222222] mb-2">My Archive</h1><p className={`text-sm ${theme.textSecondary}`}>Review and download your past applications.</p></div>

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
  );
}
