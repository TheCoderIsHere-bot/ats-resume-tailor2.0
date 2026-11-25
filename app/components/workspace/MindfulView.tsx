'use client';

import { useEffect, useState } from 'react';
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
      className={`flex-1 flex flex-col items-center justify-center px-6 relative animate-mindful-enter transition-all duration-500 ease-out ${
        apiResolved ? 'opacity-0 scale-[0.985] delay-200 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle breathing ambient orbs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 rounded-full bg-[#8AA694]/50 mix-blend-multiply filter blur-3xl animate-breathe" />
        <div className="absolute w-52 h-52 rounded-full bg-[#b8c9bf]/50 mix-blend-multiply filter blur-3xl animate-breathe-slow" />
      </div>

      {/* Centered calm step progress */}
      <div className="relative z-10 text-center flex flex-col items-center gap-4 max-w-xl">
        <div className="min-h-[2.75rem] flex items-center justify-center">
          <h2
            key={processingStep}
            className="text-2xl md:text-3xl font-medium text-[#3F4542] animate-step-reveal"
          >
            {mindfulSteps[processingStep]}
          </h2>
        </div>

        {/* Gentle rotating message when final AI polish takes a few extra seconds */}
        <div className="min-h-[1.5rem] flex items-center justify-center">
          {showWaiting && !apiResolved && (
            <p
              key={waitingIdx}
              className="text-sm text-[#7B847E] animate-step-reveal"
            >
              {waitingLines[waitingIdx]}
            </p>
          )}
        </div>

        {/* Calm step indicator dots */}
        <div className="flex items-center gap-2 mt-1">
          {mindfulSteps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-700 ease-out ${
                i === processingStep
                  ? 'w-5 h-1.5 bg-[#8AA694]'
                  : i < processingStep
                  ? 'w-1.5 h-1.5 bg-[#8AA694]/45'
                  : 'w-1.5 h-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
