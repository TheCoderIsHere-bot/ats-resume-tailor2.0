'use client';

import { RotateCcw, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';

export function ErrorToast() {
  const { error, lastCraftInputs, setError, setLastCraftInputs, handleRetry } = useApp();

  if (!error) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-2xl text-sm font-medium shadow-md flex items-center gap-3 animate-gentle max-w-[90vw]">
      <span className="flex-1">{error}</span>
      {lastCraftInputs && (
        <button onClick={() => { setError(null); handleRetry(); }} className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold transition-colors flex-shrink-0"><RotateCcw size={12} /> Retry</button>
      )}
      <button onClick={() => { setError(null); setLastCraftInputs(null); }} className="flex-shrink-0"><X size={16} /></button>
    </div>
  );
}
