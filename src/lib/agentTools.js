const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const codeLike = (text = '') =>
  /function|const|let|var|class|import|export|=>|<\/?[a-z][\s\S]*>/i.test(text);

const splitSentences = (text = '') =>
  safeText(text)
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const buildProgressAnalyzerOutput = (memory, currentModule) => {
  if (!memory) return 'No historical learner data available yet.';

  const progress = memory.progress || {};
  const weakTopics = Object.entries(memory.weakTopics || {})
    .sort((a, b) => (b[1]?.confusionCount || 0) - (a[1]?.confusionCount || 0))
    .slice(0, 3)
    .map(([topic, stats]) => `${topic} (confusion:${stats?.confusionCount || 0})`);

  return [
    `Total interactions: ${progress.totalInteractions || 0}`,
    `Modules completed: ${progress.modulesCompleted || 0}`,
    `Current module: ${currentModule?.title || progress.lastModuleTitle || 'N/A'}`,
    `Top weak topics: ${weakTopics.length ? weakTopics.join('; ') : 'none identified'}`,
  ].join('\n');
};

const buildExplanationGeneratorOutput = (userMessage, currentModule) => {
  const focus = currentModule?.title || 'the current topic';
  const cue = splitSentences(userMessage)[0] || 'Learner asked for help';

  return [
    `Focus concept: ${focus}`,
    `Learner intent cue: ${cue}`,
    'Explain in 3 steps:',
    '1) one plain-language definition',
    '2) one concrete example',
    '3) one quick check question',
  ].join('\n');
};

const buildQuizGeneratorOutput = (currentModule) => {
  const topic = currentModule?.title || 'Current lesson';
  return [
    `Mini-quiz topic: ${topic}`,
    'Generate 1 question only, 4 options, one correct answer.',
    'After question, wait for learner answer before revealing correction.',
  ].join('\n');
};

const buildCodeEvaluatorOutput = (userMessage, fileData, lastAssistant) => {
  const candidateCode =
    (fileData?.type === 'text' ? fileData.content : '') ||
    (codeLike(userMessage) ? userMessage : '');

  if (!candidateCode) return 'No code payload detected for evaluation.';

  const lines = candidateCode.split('\n').length;
  return [
    `Detected code submission (${lines} lines).`,
    `Last tutor task context: ${safeText(lastAssistant).slice(0, 140) || 'none'}`,
    'Evaluate correctness against latest task, then return:',
    '- pass/fail',
    '- one fix hint max',
    '- next step',
  ].join('\n');
};

export const decideAndRunAgentTools = ({
  userMessage = '',
  currentModule = null,
  memory = null,
  fileData = null,
  conversationHistory = [],
}) => {
  const text = safeText(userMessage).toLowerCase();
  const tools = [];
  const outputs = [];

  const asksQuiz = /\bquiz|test me|practice question|mcq\b/i.test(text);
  const asksExplain = /\bexplain|clarify|teach|what is|how does\b/i.test(text);
  const hasCode = codeLike(userMessage) || (fileData?.type === 'text' && codeLike(fileData.content || ''));
  const asksProgress = /\bprogress|how am i doing|weak|improve|where am i\b/i.test(text);

  if (asksProgress || (memory?.progress?.totalInteractions || 0) > 0) {
    tools.push('progress_analyzer');
    outputs.push(`[progress_analyzer]\n${buildProgressAnalyzerOutput(memory, currentModule)}`);
  }

  if (asksExplain || text.length < 6) {
    tools.push('explanation_generator');
    outputs.push(`[explanation_generator]\n${buildExplanationGeneratorOutput(userMessage, currentModule)}`);
  }

  if (asksQuiz) {
    tools.push('quiz_generator');
    outputs.push(`[quiz_generator]\n${buildQuizGeneratorOutput(currentModule)}`);
  }

  if (hasCode) {
    const lastAssistant = conversationHistory
      .slice()
      .reverse()
      .find((m) => m.role === 'assistant')?.content;
    tools.push('code_evaluator');
    outputs.push(`[code_evaluator]\n${buildCodeEvaluatorOutput(userMessage, fileData, lastAssistant)}`);
  }

  const uniqueTools = [...new Set(tools)].slice(0, 3);
  return {
    toolCalls: uniqueTools,
    toolContext: outputs.join('\n\n') || 'No tool output generated for this turn.',
  };
};
