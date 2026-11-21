'use client';

import { History, X } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function BillingModal() {
  const { showBillingModal, setShowBillingModal, transactions } = useApp();

  if (!showBillingModal) return null;

  return (
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
  );
}
