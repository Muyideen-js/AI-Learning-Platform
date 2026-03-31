export const AGENT_CONFIG = {
  cache: {
    maxEntries: 120,
    ttlMs: 1000 * 60 * 8,
  },
  generation: {
    simple: {
      maxOutputTokens: 420,
      historyTurns: 6,
      temperature: 0.7,
    },
    complex: {
      maxOutputTokens: 800,
      historyTurns: 10,
      temperature: 0.88,
    },
  },
  memory: {
    maxMistakes: 30,
    maxWeakTopics: 12,
    maxMemoryChars: 1600,
  },
};
