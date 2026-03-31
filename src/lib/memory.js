import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AGENT_CONFIG } from './agentConfig';

const MAX_MISTAKES = AGENT_CONFIG.memory.maxMistakes;
const MAX_WEAK_TOPICS = AGENT_CONFIG.memory.maxWeakTopics;
const MAX_MEMORY_CHARS = AGENT_CONFIG.memory.maxMemoryChars;

const CONFUSION_PATTERNS = [
  /i\s+don't\s+understand/i,
  /i\s+dont\s+understand/i,
  /i'?m\s+confused/i,
  /this\s+is\s+confusing/i,
  /i\s+am\s+stuck/i,
  /stuck\s+on/i,
  /not\s+clear/i,
  /hard\s+for\s+me/i,
];

const PREFERENCE_PATTERNS = [
  { key: 'likesExamples', regex: /examples?|real[-\s]?world/i },
  { key: 'likesStepByStep', regex: /step[-\s]?by[-\s]?step|slowly/i },
  { key: 'likesShortAnswers', regex: /short|brief|concise/i },
  { key: 'likesChallenges', regex: /challenge|exercise|task/i },
];

const getMemoryDocRef = (userId, companionId) =>
  doc(db, 'users', userId, 'learningMemory', companionId || 'global');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const nowIso = () => new Date().toISOString();

const pickTopicFromContext = (currentModule, fallback) => {
  if (currentModule?.title) return safeText(currentModule.title);
  return safeText(fallback) || 'General';
};

const scoreTopicRelevance = (topic, query) => {
  const t = topic.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (q.includes(t)) return 3;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.some((w) => q.includes(w))) return 1;
  return 0;
};

export const getUserLearningMemory = async (userId, companionId) => {
  if (!userId) return null;

  try {
    const snap = await getDoc(getMemoryDocRef(userId, companionId));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    console.error('Failed to fetch learning memory:', error);
    return null;
  }
};

export const buildRelevantMemoryContext = (
  memory,
  { userMessage = '', currentModule = null, maxChars = MAX_MEMORY_CHARS } = {}
) => {
  if (!memory) return '';

  const lines = [];
  const message = safeText(userMessage);
  const activeTopic = pickTopicFromContext(currentModule, memory?.lastTopic);

  if (memory?.progress) {
    const progress = memory.progress;
    lines.push(
      `Progress: totalInteractions=${progress.totalInteractions || 0}, modulesCompleted=${progress.modulesCompleted || 0}, lastModule=${progress.lastModuleTitle || 'N/A'}`
    );
  }

  if (memory?.preferences) {
    const prefs = Object.entries(memory.preferences)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
    if (prefs.length) {
      lines.push(`Learning preferences: ${prefs.join(', ')}`);
    }
  }

  const weakTopics = Object.entries(memory?.weakTopics || {})
    .map(([topic, details]) => ({
      topic,
      confusionCount: details?.confusionCount || 0,
      relevance: scoreTopicRelevance(topic, `${message} ${activeTopic}`),
      lastSeen: details?.lastSeen || '',
    }))
    .sort((a, b) =>
      b.relevance - a.relevance ||
      b.confusionCount - a.confusionCount ||
      String(b.lastSeen).localeCompare(String(a.lastSeen))
    )
    .slice(0, 4);

  if (weakTopics.length) {
    lines.push(
      `Weak topics: ${weakTopics
        .map((t) => `${t.topic} (confusion:${t.confusionCount})`)
        .join('; ')}`
    );
  }

  const mistakes = (memory?.pastMistakes || [])
    .slice()
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')))
    .filter((m) => {
      const topic = safeText(m.topic).toLowerCase();
      const msg = message.toLowerCase();
      return !msg || (topic && (msg.includes(topic) || activeTopic.toLowerCase().includes(topic)));
    })
    .slice(0, 3);

  if (mistakes.length) {
    lines.push(
      `Past mistakes to address: ${mistakes
        .map((m) => `${m.topic}: ${safeText(m.summary).slice(0, 90)}`)
        .join(' | ')}`
    );
  }

  const context = lines.join('\n').slice(0, clamp(maxChars, 300, 3000));
  return context;
};

export const updateLearningMemoryAfterTurn = async ({
  userId,
  companionId,
  companion = null,
  userMessage = '',
  assistantMessage = '',
  currentModule = null,
  quizEvent = null,
}) => {
  if (!userId) return;

  try {
    const ref = getMemoryDocRef(userId, companionId);
    const existingSnap = await getDoc(ref);
    const existing = existingSnap.exists() ? existingSnap.data() : {};
    const updated = JSON.parse(JSON.stringify(existing || {}));

    updated.userId = userId;
    updated.companionId = companionId || null;
    updated.subject = companion?.subject || updated.subject || '';
    updated.topic = companion?.topic || updated.topic || '';
    updated.lastTopic = pickTopicFromContext(currentModule, companion?.topic);
    updated.updatedAt = nowIso();

    const progress = updated.progress || {};
    progress.totalInteractions = (progress.totalInteractions || 0) + 1;
    progress.lastModuleId = currentModule?.id || progress.lastModuleId || 1;
    progress.lastModuleTitle = currentModule?.title || progress.lastModuleTitle || '';
    progress.lastSeenAt = nowIso();
    updated.progress = progress;

    const preferences = { ...(updated.preferences || {}) };
    const combinedText = `${safeText(userMessage)} ${safeText(assistantMessage)}`;
    PREFERENCE_PATTERNS.forEach(({ key, regex }) => {
      if (regex.test(combinedText)) preferences[key] = true;
    });
    updated.preferences = preferences;

    const weakTopics = { ...(updated.weakTopics || {}) };
    const activeTopic = pickTopicFromContext(currentModule, companion?.topic);
    const isConfused = CONFUSION_PATTERNS.some((pattern) => pattern.test(userMessage));
    if (isConfused && activeTopic) {
      const prev = weakTopics[activeTopic] || { confusionCount: 0 };
      weakTopics[activeTopic] = {
        confusionCount: (prev.confusionCount || 0) + 1,
        lastSeen: nowIso(),
      };
    }

    if (quizEvent?.type === 'fail' && activeTopic) {
      const prev = weakTopics[activeTopic] || { confusionCount: 0 };
      weakTopics[activeTopic] = {
        confusionCount: (prev.confusionCount || 0) + 2,
        lastSeen: nowIso(),
      };
    }

    if (quizEvent?.type === 'pass') {
      progress.modulesCompleted = (progress.modulesCompleted || 0) + 1;
      if (activeTopic && weakTopics[activeTopic]) {
        weakTopics[activeTopic] = {
          ...weakTopics[activeTopic],
          confusionCount: Math.max(0, (weakTopics[activeTopic].confusionCount || 0) - 1),
          lastSeen: nowIso(),
        };
      }
    }

    const weakEntries = Object.entries(weakTopics)
      .sort((a, b) => (b[1]?.confusionCount || 0) - (a[1]?.confusionCount || 0))
      .slice(0, MAX_WEAK_TOPICS);
    updated.weakTopics = Object.fromEntries(weakEntries);

    const mistakes = Array.isArray(updated.pastMistakes) ? updated.pastMistakes.slice() : [];
    if (quizEvent?.type === 'fail') {
      mistakes.push({
        topic: activeTopic,
        summary: `Quiz score ${quizEvent.score}% below pass threshold`,
        lastSeen: nowIso(),
      });
    }
    if (isConfused) {
      mistakes.push({
        topic: activeTopic,
        summary: safeText(userMessage).slice(0, 140),
        lastSeen: nowIso(),
      });
    }
    updated.pastMistakes = mistakes.slice(-MAX_MISTAKES);

    await setDoc(ref, updated, { merge: true });
  } catch (error) {
    console.error('Failed to update learning memory:', error);
  }
};
