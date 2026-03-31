import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const getReasoningRef = (userId, companionId) =>
  doc(db, 'users', userId, 'reasoningState', companionId || 'global');

const inferLearnerSignal = (userMessage = '') => {
  if (/don't understand|confused|stuck|not clear/i.test(userMessage)) return 'confused';
  if (/thanks|got it|understand|clear now/i.test(userMessage)) return 'understood';
  return 'neutral';
};

export const getReasoningState = async (userId, companionId) => {
  if (!userId) return null;
  try {
    const snap = await getDoc(getReasoningRef(userId, companionId));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error('Failed to fetch reasoning state:', error);
    return null;
  }
};

export const buildReasoningContext = (state, currentModule) => {
  if (!state) return 'No prior reasoning state.';
  return [
    `Module anchor: ${currentModule?.title || state.moduleTitle || 'N/A'}`,
    `Last plan: ${safeText(state.lastPlan) || 'N/A'}`,
    `Last act: ${safeText(state.lastAct) || 'N/A'}`,
    `Last reflection: ${safeText(state.lastReflect) || 'N/A'}`,
    `Next step: ${safeText(state.nextStep) || 'N/A'}`,
    `Learner signal: ${safeText(state.learnerSignal) || 'neutral'}`,
  ].join('\n');
};

export const updateReasoningStateAfterTurn = async ({
  userId,
  companionId,
  currentModule = null,
  userMessage = '',
  assistantMessage = '',
}) => {
  if (!userId) return;
  try {
    const now = new Date().toISOString();
    const learnerSignal = inferLearnerSignal(userMessage);
    const moduleTitle = currentModule?.title || 'General';
    const shortUser = safeText(userMessage).slice(0, 120);
    const shortAssistant = safeText(assistantMessage).slice(0, 160);

    const plan =
      learnerSignal === 'confused'
        ? `Re-teach ${moduleTitle} with simpler analogy and one check question.`
        : `Advance ${moduleTitle} by one incremental concept.`;
    const reflect =
      learnerSignal === 'understood'
        ? 'Learner shows comprehension signal.'
        : learnerSignal === 'confused'
          ? 'Learner confusion detected; reduce complexity.'
          : 'Learner state neutral; continue progressive pacing.';
    const nextStep =
      learnerSignal === 'confused'
        ? 'Give one simplified example and ask a diagnostic follow-up.'
        : 'Give one micro-task and wait for response.';

    const payload = {
      moduleTitle,
      learnerSignal,
      lastUserCue: shortUser,
      lastPlan: plan,
      lastAct: shortAssistant || 'N/A',
      lastReflect: reflect,
      nextStep,
      updatedAt: now,
    };

    await setDoc(getReasoningRef(userId, companionId), payload, { merge: true });
  } catch (error) {
    console.error('Failed to update reasoning state:', error);
  }
};
