const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const confusionPatterns = [
  /i\s+don'?t\s+understand/i,
  /i'?m\s+confused/i,
  /not\s+clear/i,
  /still\s+lost/i,
  /can\s+you\s+repeat/i,
  /hard\s+for\s+me/i,
];

export const detectConfusion = (userMessage = '') =>
  confusionPatterns.some((rx) => rx.test(userMessage));

export const estimateDifficultyLevel = ({ memory, currentModule, conversationHistory }) => {
  const totalTurns = conversationHistory?.length || 0;
  const confusionCountForTopic =
    memory?.weakTopics?.[currentModule?.title || '']?.confusionCount || 0;
  const modulesCompleted = memory?.progress?.modulesCompleted || 0;

  let score = 0;
  score += Math.floor(totalTurns / 8);
  score += modulesCompleted;
  score -= clamp(confusionCountForTopic, 0, 4);

  if (score <= 1) return 'beginner';
  if (score <= 4) return 'intermediate';
  return 'advanced';
};

export const buildLearningAgentDirectives = ({
  userMessage = '',
  companion = null,
  memory = null,
  currentModule = null,
  conversationHistory = [],
}) => {
  const difficulty = estimateDifficultyLevel({
    memory,
    currentModule,
    conversationHistory,
  });
  const confused = detectConfusion(userMessage);
  const moduleTitle = safeText(currentModule?.title) || safeText(companion?.topic) || 'Current lesson';

  return `
LEARNING AGENT MODE (internal workflow):
- Run this internal sequence before answering: PLAN -> THINK -> ACT -> RESPOND.
- Keep PLAN/THINK internal. Never reveal them.
- ACT should deliver exactly one clear teaching step for "${moduleTitle}".
- RESPOND should include:
  1) short explanation
  2) one micro-check question OR a tiny task
  3) adaptation hint based on learner state

Adaptive policy:
- Current difficulty target: ${difficulty}.
- If confused=${confused ? 'yes' : 'no'}, simplify wording, use analogy, and ask a diagnostic follow-up.
- Prefer progressive teaching: one concept at a time.
- If user is doing well, slightly increase challenge depth.
- If memory shows weak-topic overlap, briefly remediate before moving forward.
`;
};
