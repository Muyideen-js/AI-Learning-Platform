import { initializeApp } from 'firebase-admin/app';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const rateLimitMap = new Map();
const diagnosticsByUser = new Map();
const responseCache = new Map();

const REGION = 'us-central1';
const GEMINI_VERSION = 'v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';
const MISSION_COLLECTION = 'learningMissionState';
const CONFUSION_MARKERS = ['confused', "don't understand", 'not clear', 'hard', 'difficult', 'stuck'];
const CACHE_TTL_MS = 1000 * 60 * 5;
const MAX_CACHE_ENTRIES = 500;

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }
  return request.auth.uid;
}

function checkRateLimit(uid, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const key = `${uid}:default`;
  const prev = rateLimitMap.get(key) || [];
  const recent = prev.filter((stamp) => now - stamp < windowMs);
  recent.push(now);
  rateLimitMap.set(key, recent);
  if (recent.length > limit) {
    throw new HttpsError('resource-exhausted', 'Rate limit exceeded. Please wait and retry.');
  }
}

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new HttpsError('failed-precondition', 'Server Gemini key is missing.');
  }
  return key;
}

async function callGeminiGenerateContent({ model = DEFAULT_MODEL, systemInstruction, userPrompt, temperature = 0.7, maxOutputTokens = 2048, responseMimeType }) {
  const apiKey = getApiKey();
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
    ...(systemInstruction ? {
      systemInstruction: {
        role: 'system',
        parts: [{ text: systemInstruction }],
      },
    } : {}),
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/${GEMINI_VERSION}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new HttpsError('internal', `Gemini error (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) {
    throw new HttpsError('internal', 'Gemini returned empty response.');
  }
  return text;
}

async function callGeminiWithFallback(params) {
  try {
    const text = await callGeminiGenerateContent({ ...params, model: params.model || DEFAULT_MODEL });
    return { text, modelUsed: params.model || DEFAULT_MODEL, usedFallback: false };
  } catch (error) {
    const maybeRetryable = String(error?.message || '').includes('Gemini error (503)')
      || String(error?.message || '').includes('Gemini error (429)');
    if (!maybeRetryable) throw error;
    const text = await callGeminiGenerateContent({ ...params, model: FALLBACK_MODEL });
    return { text, modelUsed: FALLBACK_MODEL, usedFallback: true };
  }
}

function sanitizeForCache(input = '') {
  return String(input || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 400);
}

function makeCacheKey({ uid, companionId, moduleId, userMessage }) {
  return `${uid}::${companionId || 'default'}::${moduleId || 'none'}::${sanitizeForCache(userMessage)}`;
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (now - value.ts > CACHE_TTL_MS) {
      responseCache.delete(key);
    }
  }
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const sorted = Array.from(responseCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
  const overflow = responseCache.size - MAX_CACHE_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    responseCache.delete(sorted[i][0]);
  }
}

function getCachedResponse(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedResponse(key, payload) {
  responseCache.set(key, { ...payload, ts: Date.now() });
  cleanupCache();
}

function getOutputBudget(userMessage = '') {
  const len = String(userMessage || '').length;
  if (len < 80) return 900;
  if (len < 300) return 1400;
  return 1900;
}

function missionDocId(uid, companionId) {
  return `${uid}__${companionId || 'default'}`;
}

async function getMissionState(uid, companionId) {
  const ref = db.collection(MISSION_COLLECTION).doc(missionDocId(uid, companionId));
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      completedModules: 0,
      interactions: 0,
      difficultyLevel: 'beginner',
      nextStep: 'Ask what topic the learner wants to master first.',
      weakTopics: [],
    };
  }
  return { ...snap.data() };
}

async function updateMissionState(uid, companionId, update) {
  const ref = db.collection(MISSION_COLLECTION).doc(missionDocId(uid, companionId));
  await ref.set(
    {
      ...update,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function detectConfusionSignal(input = '') {
  const text = String(input || '').toLowerCase();
  return CONFUSION_MARKERS.some((marker) => text.includes(marker));
}

function chooseDifficulty({ priorDifficulty = 'beginner', interactions = 0, confusionCount = 0 }) {
  if (confusionCount >= 3) return 'beginner';
  if (interactions >= 20 && confusionCount <= 1) return 'advanced';
  if (interactions >= 8) return 'intermediate';
  return priorDifficulty || 'beginner';
}

function ensureTutorFollowUp(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('?')) return trimmed;
  return `${trimmed}\n\nQuick check: does this part make sense, or should I simplify it further?`;
}

export const evaluateQuizAttempt = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 40, 60_000);

  const {
    companionId = 'default',
    moduleTitle = 'Current Module',
    score = 0,
    passed = false,
  } = request.data || {};

  const missionState = await getMissionState(uid, companionId);
  const safeScore = Math.max(0, Math.min(Number(score) || 0, 100));
  const pass = Boolean(passed);

  const interactions = Number(missionState.interactions || 0) + 1;
  const confusionCount = Math.max(
    0,
    Number(missionState.confusionCount || 0) + (pass ? -1 : 1)
  );
  const difficultyLevel = chooseDifficulty({
    priorDifficulty: missionState.difficultyLevel,
    interactions,
    confusionCount,
  });

  const weakTopics = pass
    ? (missionState.weakTopics || []).filter((topic) => topic !== moduleTitle).slice(0, 5)
    : Array.from(new Set([...(missionState.weakTopics || []), moduleTitle])).slice(0, 5);

  await updateMissionState(uid, companionId, {
    interactions,
    confusionCount,
    difficultyLevel,
    weakTopics,
    completedModules: Number(missionState.completedModules || 0) + (pass ? 1 : 0),
    lastQuiz: {
      moduleTitle,
      score: safeScore,
      passed: pass,
      at: new Date().toISOString(),
    },
    nextStep: pass
      ? `Great progress. Continue to the next module after a short recap.`
      : `Revisit ${moduleTitle} fundamentals and retake a quick checkpoint quiz.`,
  });

  return {
    accepted: true,
    summary: pass
      ? `Passed ${moduleTitle} with ${safeScore}%.`
      : `Needs reinforcement in ${moduleTitle} (${safeScore}%).`,
  };
});

export const getLearningProgressSummary = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 60, 60_000);

  const { companionId = 'default' } = request.data || {};
  const missionState = await getMissionState(uid, companionId);

  const summary = {
    modulesCompleted: Number(missionState.completedModules || 0),
    interactions: Number(missionState.interactions || 0),
    weakTopics: Array.isArray(missionState.weakTopics) ? missionState.weakTopics.slice(0, 4) : [],
    difficultyLevel: missionState.difficultyLevel || 'beginner',
    nextStep: missionState.nextStep || '',
    lastQuiz: missionState.lastQuiz || null,
  };

  return { summary };
});

export const generateTutorResponse = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 40, 60_000);

  const {
    userMessage = '',
    companion = {},
    conversationHistory = [],
    currentModule = null,
    fileData = null,
    memoryMeta = {},
  } = request.data || {};
  const companionId = memoryMeta?.companionId || companion?.id || 'default';
  const missionState = await getMissionState(uid, companionId);
  const confusionSignal = detectConfusionSignal(userMessage);
  const nextInteractionCount = Number(missionState.interactions || 0) + 1;
  const nextConfusionCount = Number(missionState.confusionCount || 0) + (confusionSignal ? 1 : 0);
  const difficultyLevel = chooseDifficulty({
    priorDifficulty: missionState.difficultyLevel,
    interactions: nextInteractionCount,
    confusionCount: nextConfusionCount,
  });

  const tone = companion?.style === 'formal' ? 'formal' : 'friendly';
  const historyText = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .slice(-12)
    .map((m) => `${m?.role === 'assistant' ? 'Tutor' : 'Student'}: ${typeof m?.content === 'string' ? m.content : ''}`)
    .join('\n');

  const fileHint = fileData
    ? `\nAttached file summary: ${fileData.name || 'file'}`
    : '';

  const systemInstruction = [
    'You are an adaptive AI tutor.',
    `Use ${tone} teaching style.`,
    'Follow plan -> think -> act internally and return only final helpful answer.',
    'Ask one follow-up question when useful.',
    `Current learner level: ${missionState.difficultyLevel || 'beginner'}.`,
    `Known weak topics: ${(missionState.weakTopics || []).slice(0, 4).join(', ') || 'none yet'}.`,
    `Suggested next step: ${missionState.nextStep || 'guide learner through current module'}.`,
    confusionSignal ? 'The learner sounds confused; simplify explanations and verify understanding.' : '',
  ].join(' ');

  const prompt = [
    `Companion topic: ${companion?.topic || 'General learning'}`,
    currentModule ? `Current module: ${currentModule.title || currentModule.id || 'N/A'}` : '',
    historyText ? `Recent conversation:\n${historyText}` : '',
    `Student message: ${userMessage}`,
    fileHint,
  ].filter(Boolean).join('\n\n');
  const maxOutputTokens = getOutputBudget(userMessage);
  const cacheKey = makeCacheKey({
    uid,
    companionId,
    moduleId: currentModule?.id || currentModule?.title || '',
    userMessage,
  });
  const cached = getCachedResponse(cacheKey);
  let text;
  let modelUsed = DEFAULT_MODEL;
  let usedFallback = false;
  let cacheHit = false;

  if (cached) {
    text = cached.text;
    modelUsed = cached.modelUsed || DEFAULT_MODEL;
    usedFallback = Boolean(cached.usedFallback);
    cacheHit = true;
  } else {
    const generation = await callGeminiWithFallback({
      model: DEFAULT_MODEL,
      systemInstruction,
      userPrompt: prompt,
      temperature: 0.8,
      maxOutputTokens,
    });
    const rawText = generation.text;
    text = confusionSignal ? ensureTutorFollowUp(rawText) : rawText;
    modelUsed = generation.modelUsed;
    usedFallback = generation.usedFallback;
    setCachedResponse(cacheKey, { text, modelUsed, usedFallback });
  }

  const diagnostics = {
    model: modelUsed,
    cacheHit,
    usedFallback,
    toolCalls: [],
    budget: { maxOutputTokens },
    generatedAt: new Date().toISOString(),
    missionState: {
      difficultyLevel: missionState.difficultyLevel || 'beginner',
      weakTopics: (missionState.weakTopics || []).slice(0, 3),
      nextStep: missionState.nextStep || '',
      confusionCount: Number(missionState.confusionCount || 0),
    },
    followUpInjected: confusionSignal,
  };
  diagnosticsByUser.set(uid, diagnostics);

  const weakTopics = Array.from(
    new Set([
      ...(Array.isArray(missionState.weakTopics) ? missionState.weakTopics : []),
      ...(String(userMessage || '')
        .toLowerCase()
        .includes('confus') ? [currentModule?.title || companion?.topic || 'current topic'] : []),
    ])
  ).slice(0, 5);

  await updateMissionState(uid, companionId, {
    interactions: nextInteractionCount,
    confusionCount: nextConfusionCount,
    difficultyLevel,
    weakTopics,
    nextStep: currentModule
      ? `Continue ${currentModule.title} and verify understanding with one checkpoint question.`
      : missionState.nextStep || 'Start module 1 with goals and expectations.',
  });

  return { text, diagnostics };
});

export const generateAdaptiveQuiz = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 20, 60_000);

  const {
    moduleTitle = 'Current Topic',
    moduleDescription = '',
    conversationTranscript = '',
    adaptiveContext = {},
    companionId = 'default',
  } = request.data || {};
  const missionState = await getMissionState(uid, companionId);

  const level = adaptiveContext?.difficultyLevel || missionState?.difficultyLevel || 'intermediate';
  const weakTopics = Array.isArray(adaptiveContext?.weakTopics)
    ? adaptiveContext.weakTopics.slice(0, 3).join(', ')
    : (missionState?.weakTopics || []).slice(0, 3).join(', ') || 'none';

  const prompt = `You are a strict JSON generator.
Generate exactly 3 multiple choice questions.
Topic: ${moduleTitle}
Description: ${moduleDescription}
Difficulty: ${level}
Weak topics: ${weakTopics}
Transcript:
${conversationTranscript || 'No transcript'}

Return only a JSON array. Each item:
{
  "question":"...",
  "options":["A","B","C","D"],
  "correctAnswer":0,
  "explanation":"..."
}`;

  const raw = await callGeminiGenerateContent({
    model: DEFAULT_MODEL,
    userPrompt: prompt,
    temperature: 0.2,
    maxOutputTokens: 1500,
  });

  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  let questions = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      questions = parsed.slice(0, 3);
    }
  } catch {
    throw new HttpsError('internal', 'Failed to parse adaptive quiz JSON.');
  }

  await updateMissionState(uid, companionId, {
    nextStep: `Review quiz results for ${moduleTitle} and decide whether to reinforce or advance.`,
  });

  return { questions };
});

export const evaluateCodeSubmission = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 25, 60_000);

  const { code = '', language = 'javascript', moduleContext = '', lastAiMessage = '' } = request.data || {};
  if (!code || !String(code).trim()) {
    throw new HttpsError('invalid-argument', 'Code is required.');
  }

  const prompt = `You are an expert ${language} coding tutor.
${moduleContext ? `Context: ${moduleContext}` : ''}
${lastAiMessage ? `Challenge Assigned: ${lastAiMessage}` : ''}

Code:
\`\`\`${language}
${code}
\`\`\`

Return markdown in this format only:
**✅ Result: Passed** or **❌ Result: Failed**
**Hint/Feedback:** one sentence
**Next Step:** one sentence`;

  const review = await callGeminiGenerateContent({
    model: DEFAULT_MODEL,
    userPrompt: prompt,
    temperature: 0.3,
    maxOutputTokens: 800,
  });

  return { review };
});

export const generateCompanionCurriculum = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 10, 60_000);

  const {
    topic = '',
    description = '',
    numberOfModules = 8,
    difficulty = 'Beginner',
  } = request.data || {};

  const moduleCount = Math.min(Math.max(Number(numberOfModules) || 8, 1), 10);
  const prompt = `Create a ${difficulty} curriculum for "${topic}".
Description: ${description}

Return strict JSON:
{
  "modules": [
    {
      "id": 1,
      "title": "Module title",
      "description": "Short description",
      "subtopics": [
        { "id": 1, "title": "Subtopic", "description": "Short description" }
      ],
      "quiz": { "questions": [ { "question": "...", "options": ["A","B","C","D"], "correctAnswer": 0 } ] }
    }
  ]
}

Rules:
- Exactly ${moduleCount} modules
- Exactly 4 subtopics per module
- Exactly 1 quiz question per module`;

  const raw = await callGeminiGenerateContent({
    model: DEFAULT_MODEL,
    userPrompt: prompt,
    temperature: 0.6,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  });

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : raw);
  }

  if (!Array.isArray(data?.modules)) {
    throw new HttpsError('internal', 'Invalid curriculum structure.');
  }

  return { modules: data.modules };
});

export const getTutorDiagnostics = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  return { diagnostics: diagnosticsByUser.get(uid) || null };
});
