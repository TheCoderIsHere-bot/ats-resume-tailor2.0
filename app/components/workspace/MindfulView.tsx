'use client';

import { SkipForward } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { mindfulSteps, waitingLines } from '@/lib/theme';

export function MindfulView() {
  const { processingStep, stepAnimKey, loopCount, apiResolved, handleSkipMindful } = useApp();

  const isOnLastStep = processingStep === mindfulSteps.length - 1;
  // While API is still running: loop with the same fade animation as every other step
  // Once apiResolved: use text-hold so it stays visible during the 2s transition to review
  const lastStepAnim = isOnLastStep
    ? (apiResolved ? 'animate-text-hold' : 'animate-text-fade')
    : 'animate-text-fade';

  // Show a waiting sub-line from the 3rd loop onward (loopCount >= 2, 0-indexed)
  const showWaitingLine = isOnLastStep && loopCount >= 2 && !apiResolved;
  // Pick the next message each loop so it never repeats back-to-back
  const waitingLineText = waitingLines[(loopCount - 2) % waitingLines.length];

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative animate-gentle">
      {/* Background orbs */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 rounded-full bg-[#8AA694] mix-blend-multiply filter blur-3xl animate-breathe" />
        <div className="absolute w-48 h-48 rounded-full bg-[#b8c9bf] mix-blend-multiply filter blur-2xl animate-breathe" style={{ animationDelay: '1s' }} />
      </div>

      {/* Main step text */}
      <div className="relative z-10 text-center flex flex-col items-center gap-4">
        <h2
          key={`${processingStep}-${stepAnimKey}`}
          className={`text-2xl md:text-3xl font-medium text-[#444444] ${lastStepAnim}`}
        >
          {mindfulSteps[processingStep]}
        </h2>

        {/* Dynamic waiting sub-line — fades in after 3rd loop on the last step */}
        <div className="h-5">
          {showWaitingLine && (
            <p
              key={`waiting-${loopCount}`}
              className="text-sm text-gray-400 italic animate-text-fade"
            >
              {waitingLineText}
            </p>
          )}
        </div>

        {/* Step dots — neutral, no green */}
        <div className="flex items-center gap-2 mt-1">
          {mindfulSteps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-700 ${
                i === processingStep
                  ? 'w-4 h-1.5 bg-gray-400'
                  : i < processingStep
                  ? 'w-1.5 h-1.5 bg-gray-300'
                  : 'w-1.5 h-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Skip button */}
      <button
        onClick={handleSkipMindful}
        className="fixed bottom-24 sm:bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors opacity-0 animate-skip-appear"
      >
        <SkipForward size={16} /> Skip animation
      </button>
    </div>
  );
}

