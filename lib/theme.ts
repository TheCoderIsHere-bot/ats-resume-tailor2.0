export const theme = {
  bgApp: 'bg-[#F7F7F9]',
  bgSurface: 'bg-white',
  textPrimary: 'text-[#333333]',
  textSecondary: 'text-[#6B7280]',
  accentSage: 'bg-[#8AA694]',
  textSage: 'text-[#8AA694]',
  accentSageHover: 'hover:bg-[#789382]',
  highlightMint: 'bg-[#ecfdf5] text-[#065f46]',
  shadowSoft: 'shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
  roundedSoft: 'rounded-3xl',
} as const;

export const mindfulSteps = [
  'Reading your experience...',
  'Finding the perfect intersections with the role...',
  'Refining your professional summary...',
  'Drafting a thoughtful cover letter...',
  'Polishing the final details...',
] as const;

// Shown below the last step after 3+ loops — keeps it feeling alive, not stuck
export const waitingLines = [
  'Great things take a moment — yours is almost ready.',
  'The AI is being extra thorough. Worth the wait.',
  'Still crafting. Your application deserves the best.',
  'Almost there — adding those final precision touches.',
  'Giving it one last read-through on your behalf.',
  'This one\'s going to be really good.',
] as const;
