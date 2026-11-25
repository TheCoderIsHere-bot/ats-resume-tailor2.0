'use client';

import { useState } from 'react';
import { FileText, CreditCard, X, Loader2 } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { theme } from '@/lib/theme';

export function PaywallModal() {
  const { showPaywall, setShowPaywall, tokens, user, fetchUserData, setError } = useApp();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (!showPaywall) return null;

  async function handleRazorpayCheckout() {
    setCheckoutLoading(true);
    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 10 }),
      });
      if (!orderRes.ok) throw new Error('Could not create order. Please try again.');
      const order = await orderRes.json();

      // Load Razorpay script only once
      if (!document.getElementById('razorpay-script')) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.id = 'razorpay-script';
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay. Check your connection.'));
          document.head.appendChild(script);
        });
      }

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Tailor.ai',
        description: '10 Application Credits',
        order_id: order.id,
        prefill: { email: user?.email ?? '' },
        theme: { color: '#8AA694' },

        // Payment succeeded — wait 3s for webhook to credit tokens, then refresh
        handler: () => {
          setShowPaywall(false);
          setTimeout(() => user && fetchUserData(user.id), 3000);
        },

        // User closed the Razorpay modal without paying — no error, just reset
        modal: {
          ondismiss: () => {
            setCheckoutLoading(false);
          },
        },
      };

      // @ts-expect-error Razorpay loaded via CDN script tag
      const rzp = new window.Razorpay(options);

      // Payment failed (card declined, network error, bank timeout, etc.)
      rzp.on('payment.failed', (response: { error: { description: string } }) => {
        setCheckoutLoading(false);
        setError(response.error?.description ?? 'Payment failed. Please try again or use a different card.');
      });

      rzp.open();
    } catch (err) {
      setCheckoutLoading(false);
      setError(err instanceof Error ? err.message : 'Could not open payment. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#F7F7F9]/80 backdrop-blur-sm" onClick={() => setShowPaywall(false)} />
      <div className="relative w-full max-w-[480px] bg-white rounded-[32px] p-10 shadow-[0_20px_60px_rgb(0,0,0,0.08)] animate-gentle">
        <button
          onClick={() => setShowPaywall(false)}
          className="absolute top-6 right-6 p-2 text-gray-400 hover:text-[#333333] hover:bg-gray-50 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-full ${theme.accentSage} bg-opacity-10 flex items-center justify-center mx-auto mb-6`}>
            <FileText size={28} className={theme.textSage} />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Get more credits</h2>
          <p className={`text-[15px] ${theme.textSecondary} leading-relaxed`}>
            {tokens === 0
              ? "You've used all your credits."
              : `You have ${tokens} credit${tokens !== 1 ? 's' : ''} remaining.`
            }{' '}
            Invest in your job search to craft more tailored applications.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100/50">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-[#333333]">Aura Pro Bundle</span>
            <span className="text-2xl font-bold text-[#333333]">{'₹'}250</span>
          </div>
          <p className="text-sm text-gray-500">10 AI-crafted applications · Credits never expire</p>
        </div>

        <button
          onClick={handleRazorpayCheckout}
          disabled={checkoutLoading}
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl ${theme.accentSage} ${theme.accentSageHover} text-white font-medium transition-all shadow-md shadow-[#8AA694]/20 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:pointer-events-none`}
        >
          {checkoutLoading
            ? <><Loader2 size={18} className="animate-spin" /> Opening checkout…</>
            : <><CreditCard size={18} /> Proceed to Checkout</>
          }
        </button>
        <p className="text-center text-xs text-gray-400 mt-6">Secured by Razorpay · 100% safe &amp; encrypted</p>
      </div>
    </div>
  );
}
