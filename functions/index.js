import { initializeApp } from 'firebase-admin/app';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();

const rateLimitMap = new Map();
const diagnosticsByUser = new Map();

const REGION = 'us-central1';
const GEMINI_VERSION = 'v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

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

export const generateTutorResponse = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  checkRateLimit(uid, 40, 60_000);

  const {
    userMessage = '',
    companion = {},
    conversationHistory = [],
    currentModule = null,
    fileData = null,
  } = request.data || {};

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
  ].join(' ');

  const prompt = [
    `Companion topic: ${companion?.topic || 'General learning'}`,
    currentModule ? `Current module: ${currentModule.title || currentModule.id || 'N/A'}` : '',
    historyText ? `Recent conversation:\n${historyText}` : '',
    `Student message: ${userMessage}`,
    fileHint,
  ].filter(Boolean).join('\n\n');

  const text = await callGeminiGenerateContent({
    model: DEFAULT_MODEL,
    systemInstruction,
    userPrompt: prompt,
    temperature: 0.8,
    maxOutputTokens: 1800,
  });

  const diagnostics = {
    model: DEFAULT_MODEL,
    cacheHit: false,
    toolCalls: [],
    budget: { maxOutputTokens: 1800 },
    generatedAt: new Date().toISOString(),
  };
  diagnosticsByUser.set(uid, diagnostics);

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
  } = request.data || {};

  const level = adaptiveContext?.difficultyLevel || 'intermediate';
  const weakTopics = Array.isArray(adaptiveContext?.weakTopics) ? adaptiveContext.weakTopics.slice(0, 3).join(', ') : 'none';

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
