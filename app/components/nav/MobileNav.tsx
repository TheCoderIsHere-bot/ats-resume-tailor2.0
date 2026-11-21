'use client';

import { LogOut } from 'lucide-react';

interface MobileNavProps {
  onWorkspace: () => void;
  onArchive: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export function MobileNav({ onWorkspace, onArchive, onLogout, onClose }: MobileNavProps) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="fixed top-20 left-0 right-0 z-35 bg-white border-b border-gray-100 shadow-lg animate-slide-down md:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
          <button onClick={onWorkspace} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Workspace</button>
          <button onClick={onArchive} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">My Archive</button>
          <div className="h-px bg-gray-100 my-1" />
          <button onClick={onLogout} className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"><LogOut size={16} /> Log Out</button>
        </div>
      </div>
    </>
  );
}
