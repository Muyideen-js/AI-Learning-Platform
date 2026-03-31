import { AGENT_CONFIG } from './agentConfig';

const responseCache = new Map();

const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeKeyPart = (value) =>
  safeText(value).toLowerCase().replace(/\s+/g, ' ').slice(0, 220);

const simpleIntentPatterns = [
  /^hi$|^hello$|^hey$/i,
  /^thanks?$|^ok$|^okay$/i,
  /summar/i,
  /quick/i,
  /short/i,
  /define|definition/i,
];

const isSimpleIntent = (userMessage = '', fileData = null) => {
  if (fileData) return false;
  const text = safeText(userMessage);
  if (!text) return true;
  if (text.length < 40) return true;
  return simpleIntentPatterns.some((rx) => rx.test(text));
};

export const selectModelFromAvailable = (models = [], { userMessage = '', fileData = null } = {}) => {
  if (!Array.isArray(models) || models.length === 0) return null;

  const simple = isSimpleIntent(userMessage, fileData);
  const order = simple
    ? ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-1.5-pro']
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];

  for (const name of order) {
    const match = models.find((m) => m.name.includes(name));
    if (match) return match.name.replace('models/', '');
  }
  return models[0].name.replace('models/', '');
};

export const getGenerationBudget = ({ userMessage = '', conversationHistory = [] } = {}) => {
  const textLen = safeText(userMessage).length;
  const turns = conversationHistory.length;
  const simple = textLen < 80 && turns < 8;

  return {
    maxOutputTokens: simple
      ? AGENT_CONFIG.generation.simple.maxOutputTokens
      : AGENT_CONFIG.generation.complex.maxOutputTokens,
    historyTurns: simple
      ? AGENT_CONFIG.generation.simple.historyTurns
      : AGENT_CONFIG.generation.complex.historyTurns,
    temperature: simple
      ? AGENT_CONFIG.generation.simple.temperature
      : AGENT_CONFIG.generation.complex.temperature,
  };
};

export const trimConversationForBudget = (conversationHistory = [], maxTurns = 10, maxChars = 4200) => {
  const recent = conversationHistory.slice(-maxTurns);
  const trimmed = [];
  let totalChars = 0;

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const msg = recent[i];
    const content = typeof msg?.content === 'string'
      ? msg.content
      : (msg?.content?.text || JSON.stringify(msg?.content || ''));
    const compact = safeText(content).slice(0, 700);
    if (!compact) continue;
    if (totalChars + compact.length > maxChars) continue;
    totalChars += compact.length;
    trimmed.unshift({ ...msg, content: compact });
  }

  return trimmed;
};

export const buildCacheKey = ({
  userId = '',
  companionId = '',
  moduleId = '',
  userMessage = '',
}) => `u:${normalizeKeyPart(userId)}|c:${normalizeKeyPart(companionId)}|m:${normalizeKeyPart(String(moduleId || ''))}|q:${normalizeKeyPart(userMessage)}`;

export const getCachedResponse = (key) => {
  if (!key || !responseCache.has(key)) return null;
  const hit = responseCache.get(key);
  if (!hit || Date.now() > hit.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return hit.value;
};

export const setCachedResponse = (key, value) => {
  if (!key || !safeText(value)) return;
  responseCache.set(key, { value, expiresAt: Date.now() + AGENT_CONFIG.cache.ttlMs });
  if (responseCache.size <= AGENT_CONFIG.cache.maxEntries) return;
  const firstKey = responseCache.keys().next().value;
  if (firstKey) responseCache.delete(firstKey);
};
