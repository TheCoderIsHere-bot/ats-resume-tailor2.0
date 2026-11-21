'use client';

import { File, CreditCard, LogOut } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface ProfileMenuProps {
  user: SupabaseUser;
  showProfileMenu: boolean;
  setShowProfileMenu: (b: boolean) => void;
  onManageResume: () => void;
  onBilling: () => void;
  onLogout: () => void;
}

export function ProfileMenu({ user, showProfileMenu, setShowProfileMenu, onManageResume, onBilling, onLogout }: ProfileMenuProps) {
  if (!showProfileMenu) return null;

  return (
    <>
      <div className="absolute right-0 mt-3 w-56 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] border border-gray-100 py-2 z-50 animate-menu">
        <div className="px-4 py-3 border-b border-gray-100 mb-2">
          <p className="text-sm font-semibold text-[#333333]">{user.user_metadata?.full_name ?? 'User'}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
        <button onClick={onManageResume} className="w-full text-left px-4 py-2.5 text-sm text-[#444444] hover:bg-gray-50 flex items-center gap-3 transition-colors"><File size={16} className="text-gray-400" /> Manage Master Resume</button>
        <button onClick={onBilling} className="w-full text-left px-4 py-2.5 text-sm text-[#444444] hover:bg-gray-50 flex items-center gap-3 transition-colors"><CreditCard size={16} className="text-gray-400" /> Billing History</button>
        <div className="h-px bg-gray-100 my-2" />
        <button onClick={onLogout} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"><LogOut size={16} /> Log Out</button>
      </div>
    </>
  );
}
