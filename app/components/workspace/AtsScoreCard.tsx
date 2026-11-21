'use client';

import { theme } from '@/lib/theme';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { ATSScoreBreakdown } from '@/lib/ats-score';

interface AtsScoreCardProps {
  atsScore: number | null;        // null = JD insufficient for scoring
  scoreBefore: number | null;
  scoreBreakdown: ATSScoreBreakdown | null;
  matchedKeywords: string[];
  missedKeywords: string[];
  isLoading?: boolean;
}

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const color = score >= 80 ? '#8AA694' : score >= 60 ? '#F59E0B' : '#EF4444';
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={size < 70 ? 5 : 6} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={size < 70 ? 5 : 6}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-[#333333]" style={{ fontSize: size < 70 ? 14 : 18 }}>{score}%</span>
        </div>
      </div>
      {label && <span className="text-xs text-[#6B7280] font-medium">{label}</span>}
    </div>
  );
}

export function AtsScoreCard({
  atsScore,
  scoreBefore,
  scoreBreakdown,
  matchedKeywords,
  missedKeywords,
  isLoading,
}: AtsScoreCardProps) {
  const [expanded, setExpanded] = useState(false);

  // If score is calculating
  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto mb-6">
        <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-5 flex items-center gap-4 animate-pulse`}>
          <div className="p-2.5 rounded-full bg-[#8AA694]/10 flex-shrink-0">
            <TrendingUp size={18} className="text-[#8AA694] animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#333333]">Analyzing Job Match Score...</p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Evaluating tailored resume keywords against the job requirements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // If score is null, the JD didn't have enough keywords to score reliably
  if (atsScore === null) {
    return (
      <div className="max-w-4xl mx-auto mb-6">
        <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} p-5 flex items-center gap-4`}>
          <div className="p-2 rounded-full bg-amber-50 flex-shrink-0">
            <TrendingUp size={16} className="text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#333333]">Job Match Score unavailable</p>
            <p className="text-xs text-[#6B7280] mt-0.5">
              The job description didn&apos;t contain enough specific keywords to score reliably.
              Try pasting a more detailed JD with specific skills, tools, and requirements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const improvement = scoreBefore !== null ? atsScore - scoreBefore : null;
  const hasBefore = scoreBefore !== null;

  const scoreLabel = atsScore >= 80
    ? 'Excellent match — well-aligned with this role.'
    : atsScore >= 60
    ? 'Good match. A few more relevant details could strengthen it.'
    : 'Moderate match. The role may require skills not on your resume.';

  const hasDetail = matchedKeywords.length > 8 || missedKeywords.length > 0 || !!scoreBreakdown;

  return (
    <div className="max-w-4xl mx-auto mb-6">
      <div className={`${theme.bgSurface} ${theme.roundedSoft} ${theme.shadowSoft} overflow-hidden`}>

        {/* ── Top row ── */}
        <div className="p-6 flex flex-col sm:flex-row items-center gap-6">

          {/* Score rings */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {hasBefore && (
              <>
                <ScoreRing score={scoreBefore} size={60} label="Before" />
                {/* Arrow */}
                <div className="flex flex-col items-center gap-0.5">
                  <TrendingUp
                    size={18}
                    className={improvement !== null && improvement > 0 ? 'text-[#8AA694]' : 'text-gray-300'}
                  />
                  {improvement !== null && (
                    <span className={`text-xs font-bold ${improvement > 0 ? 'text-[#8AA694]' : 'text-gray-400'}`}>
                      {improvement > 0 ? `+${improvement}` : improvement}
                    </span>
                  )}
                </div>
              </>
            )}
            <ScoreRing score={atsScore} size={hasBefore ? 72 : 80} label={hasBefore ? 'After' : undefined} />
          </div>

          {/* Label + top keywords */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              <h3 className="text-lg font-semibold text-[#333333]">Job Match Score</h3>
              <span className="text-xs text-[#6B7280] bg-gray-100 px-2 py-0.5 rounded-full">Deterministic</span>
            </div>
            <p className="text-sm text-[#6B7280] mb-3">{scoreLabel}</p>

            {/* Breakdown pills — required / preferred / bonus */}
            {scoreBreakdown && (
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                  Required: {scoreBreakdown.requiredMatched.length}/{scoreBreakdown.requiredMatched.length + scoreBreakdown.requiredMissed.length} ({scoreBreakdown.requiredScore}/70 pts)
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                  Preferred: {scoreBreakdown.preferredMatched.length}/{scoreBreakdown.preferredMatched.length + scoreBreakdown.preferredMissed.length} ({scoreBreakdown.preferredScore}/20 pts)
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">
                  Bonus: {scoreBreakdown.bonusScore}/10 pts
                </span>
              </div>
            )}

            {/* Matched keywords preview */}
            {matchedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {matchedKeywords.slice(0, 8).map((kw) => (
                  <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#065f46] text-xs font-medium">
                    <CheckCircle2 size={10} /> {kw}
                  </span>
                ))}
                {matchedKeywords.length > 8 && !expanded && (
                  <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                    +{matchedKeywords.length - 8} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Expand toggle */}
          {hasDetail && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-shrink-0 p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
              title={expanded ? 'Collapse' : 'Show full breakdown'}
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>

        {/* ── Expanded breakdown ── */}
        {expanded && (
          <div className="border-t border-gray-100 px-6 pb-6 pt-4 space-y-5 animate-gentle">

            {/* Required keyword detail */}
            {scoreBreakdown && scoreBreakdown.requiredMatched.length + scoreBreakdown.requiredMissed.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-2">
                  Required Keywords ({scoreBreakdown.requiredMatched.length}/{scoreBreakdown.requiredMatched.length + scoreBreakdown.requiredMissed.length} matched · 70 pts max)
                </p>
                <div className="flex flex-wrap gap-2">
                  {scoreBreakdown.requiredMatched.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ecfdf5] text-[#065f46] text-xs font-medium">
                      <CheckCircle2 size={10} /> {kw}
                    </span>
                  ))}
                  {scoreBreakdown.requiredMissed.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                      <XCircle size={10} /> {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Preferred keyword detail */}
            {scoreBreakdown && scoreBreakdown.preferredMatched.length + scoreBreakdown.preferredMissed.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-2">
                  Preferred Keywords ({scoreBreakdown.preferredMatched.length}/{scoreBreakdown.preferredMatched.length + scoreBreakdown.preferredMissed.length} matched · 20 pts max)
                </p>
                <div className="flex flex-wrap gap-2">
                  {scoreBreakdown.preferredMatched.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                      <CheckCircle2 size={10} /> {kw}
                    </span>
                  ))}
                  {scoreBreakdown.preferredMissed.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 text-xs font-medium">
                      <XCircle size={10} /> {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gaps to address */}
            {missedKeywords.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wider text-gray-400 uppercase mb-2">
                  Key Gaps to Address ({missedKeywords.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {missedKeywords.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                      <XCircle size={10} /> {kw}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  These keywords appear important to the role but weren&apos;t found in your resume. Consider addressing them in interviews or upskilling.
                </p>
              </div>
            )}

            {/* Methodology note */}
            <p className="text-xs text-gray-300 border-t border-gray-50 pt-4">
              Scored using deterministic keyword matching with synonym expansion — required keywords weighted 70%, preferred 20%, experience &amp; education 10%.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
