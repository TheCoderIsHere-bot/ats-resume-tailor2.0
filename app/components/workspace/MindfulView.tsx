'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { mindfulSteps, waitingLines } from '@/lib/theme';

export function MindfulView() {
  const { processingStep, apiResolved } = useApp();
  const [waitingIdx, setWaitingIdx] = useState(0);
  const [showWaiting, setShowWaiting] = useState(false);

  const isOnLastStep = processingStep === mindfulSteps.length - 1;

  useEffect(() => {
    if (!isOnLastStep || apiResolved) return;

    const showTimer = setTimeout(() => setShowWaiting(true), 2500);
    const cycleTimer = setInterval(() => {
      setWaitingIdx((prev) => (prev + 1) % waitingLines.length);
    }, 4500);

    return () => {
      clearTimeout(showTimer);
      clearInterval(cycleTimer);
    };
  }, [isOnLastStep, apiResolved]);

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden animate-mindful-enter transition-all duration-500 ease-out ${
        apiResolved ? 'opacity-0 scale-[0.985] delay-200 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Full-canvas soft sage radial backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(138, 166, 148, 0.24) 0%, rgba(217, 236, 225, 0.22) 34%, rgba(247, 247, 249, 0) 72%)',
        }}
      />

      {/* Layered ambient gradient orbs + subtle orbital rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[460px] h-[460px] rounded-full blur-3xl animate-breathe"
          style={{
            background:
              'radial-gradient(circle at 38% 40%, rgba(111, 147, 125, 0.42) 0%, rgba(138, 166, 148, 0.26) 45%, rgba(217, 236, 225, 0) 75%)',
          }}
        />
        <div
          className="absolute w-[340px] h-[340px] translate-x-12 -translate-y-8 rounded-full blur-3xl animate-breathe-slow"
          style={{
            background:
              'radial-gradient(circle at 60% 50%, rgba(169, 198, 180, 0.48) 0%, rgba(209, 232, 218, 0.24) 52%, transparent 78%)',
          }}
        />
        <div className="absolute w-[340px] h-[340px] rounded-full border border-[#8AA694]/15" />
        <div className="absolute w-[480px] h-[480px] rounded-full border border-[#8AA694]/10" />
      </div>

      {/* Centered minimalist focal card content */}
      <div className="relative z-10 text-center flex flex-col items-center gap-5 max-w-xl">
        {/* Minimalist frosted sage emblem */}
        <div className="w-11 h-11 rounded-2xl bg-white/80 backdrop-blur-md border border-[#8AA694]/25 shadow-[0_8px_24px_rgba(95,132,110,0.12)] flex items-center justify-center">
          <Sparkles size={18} className="text-[#5F846E]" />
        </div>

        <div className="min-h-[2.75rem] flex items-center justify-center">
          <h2
            key={processingStep}
            className="text-2xl md:text-3xl font-semibold tracking-tight text-[#252B27] animate-step-reveal"
          >
            {mindfulSteps[processingStep]}
          </h2>
        </div>

        {/* Calm rotating sub-line if final polish takes longer */}
        <div className="min-h-[1.5rem] flex items-center justify-center">
          {showWaiting && !apiResolved && (
            <p
              key={waitingIdx}
              className="text-sm text-[#586A5F] animate-step-reveal"
            >
              {waitingLines[waitingIdx]}
            </p>
          )}
        </div>

        {/* Step progress dots */}
        <div className="flex items-center gap-2 mt-1 px-3.5 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-[#8AA694]/15 shadow-xs">
          {mindfulSteps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-700 ease-out ${
                i === processingStep
                  ? 'w-6 h-1.5 bg-[#5F846E]'
                  : i < processingStep
                  ? 'w-1.5 h-1.5 bg-[#8AA694]/55'
                  : 'w-1.5 h-1.5 bg-[#8AA694]/25'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
