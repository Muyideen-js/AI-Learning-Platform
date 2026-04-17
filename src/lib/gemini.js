import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Initialize the Gemini AI SDK directly in the client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'];
const MISSION_COLLECTION = 'learningMissionState';

const isModelNotFoundError = (error) => {
  const message = String(error?.message || '');
  return message.includes('models/') && message.includes('is not found');
};

const generateWithModelFallback = async (prompt, generationConfig = { temperature: 0.7, maxOutputTokens: 2048 }) => {
  const candidates = [DEFAULT_MODEL, ...FALLBACK_MODELS].filter(
    (model, idx, arr) => model && arr.indexOf(model) === idx
  );

  let lastError = null;

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      });
      return await result.response;
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) {
        throw error;
      }
      console.warn(`Gemini model "${modelName}" is unavailable. Trying fallback...`);
    }
  }

  throw lastError || new Error('No Gemini model was available.');
};

// Helper: Get learner mission state from Firestore directly
const getMissionState = async (uid, companionId) => {
  if (!uid) return null;
  const ref = doc(db, MISSION_COLLECTION, `${uid}__${companionId || 'default'}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      completedModules: 0,
      interactions: 0,
      difficultyLevel: 'beginner',
      nextStep: 'Ask what topic the learner wants to master first.',
      weakTopics: [],
    };
  }
  return snap.data();
};

// Helper: Update learner mission state in Firestore directly
const updateMissionState = async (uid, companionId, update) => {
  if (!uid) return;
  const ref = doc(db, MISSION_COLLECTION, `${uid}__${companionId || 'default'}`);
  await setDoc(ref, {
    ...update,
    updatedAt: serverTimestamp(),
  }, { merge: true });
};

// AI: Book Reader Logic (Summarize, Quiz, Chat)
export const generateBookAIResponse = async ({ action, bookContext, userMessage, conversationHistory }) => {
  try {
    const safeContext = bookContext.substring(0, 50000); // Truncate safely

    let prompt = '';

    if (action === 'summarize') {
      prompt = `Please provide a comprehensive summary of the following text:\n\n${safeContext}`;
    } else if (action === 'quiz') {
      prompt = `Based on the following text, generate a JSON array of exactly 3 multiple choice questions.\nReturn only a JSON array. Each item:\n{\n  "question":"...",\n  "options":["A","B","C","D"],\n  "correctAnswer":0,\n  "explanation":"..."\n}\n\nText:\n${safeContext}`;
    } else {
      const historyText = Array.isArray(conversationHistory) 
        ? conversationHistory.slice(-10).map((m) => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`).join('\n')
        : '';
      prompt = `Context Document:\n${safeContext}\n\n${historyText ? `Conversation History:\n${historyText}\n\n` : ''}User Question: ${userMessage}\n\nAnswer the user's question explicitly based on the context document provided. If the answer is not in the document, state that politely.`;
    }

    const response = await generateWithModelFallback(prompt, { temperature: 0.7, maxOutputTokens: 2048 });
    let text = response.text();

    // Clean up JSON if required for quiz
    if (action === 'quiz') {
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse quiz JSON:', e);
        return null;
      }
    }

    return text;
  } catch (error) {
    console.error('Book AI Response Error:', error);
    throw new Error('Failed to communicate with AI for this book.');
  }
};

// AI: Main Tutor Chat Logic
export const generateAIResponse = async (
  userMessage,
  companion,
  conversationHistory = [],
  onStreamChunk = null,
  currentModule = null,
  fileData = null,
  memoryMeta = {}
) => {
  try {
    const uid = memoryMeta?.userId;
    const companionId = memoryMeta?.companionId || companion?.id;
    
    // Fetch state for personalization
    const missionState = await getMissionState(uid, companionId);
    
    const tone = companion?.style === 'formal' ? 'formal' : 'friendly';
    
    const historyText = conversationHistory
      .slice(-12)
      .map((m) => `${m?.role === 'assistant' ? 'Tutor' : 'Student'}: ${m.content}`)
      .join('\n');

    const systemInstruction = [
      'You are an adaptive AI tutor.',
      `Use ${tone} teaching style.`,
      `Current learner level: ${missionState?.difficultyLevel || 'beginner'}.`,
      `Known weak topics: ${(missionState?.weakTopics || []).slice(0, 4).join(', ') || 'none yet'}.`,
      `Suggested next step: ${missionState?.nextStep || 'guide learner through current module'}.`,
      'Ask one follow-up question when useful.',
    ].join(' ');

    const prompt = [
      `Companion topic: ${companion?.topic || 'General learning'}`,
      currentModule ? `Current module: ${currentModule.title || 'N/A'}` : '',
      historyText ? `Recent conversation:\n${historyText}` : '',
      `Student message: ${userMessage}`,
    ].filter(Boolean).join('\n\n');

    const response = await generateWithModelFallback(`${systemInstruction}\n\n${prompt}`, { temperature: 0.8, maxOutputTokens: 2048 });
    const text = response.text();

    // Stream emulation (keep original behavior)
    if (onStreamChunk) {
      for (const word of text.split(' ')) {
        onStreamChunk(`${word} `);
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
    }

    // Update mission state in background
    if (uid && companionId) {
      updateMissionState(uid, companionId, {
        interactions: (missionState?.interactions || 0) + 1,
      });
    }

    return text;
  } catch (error) {
    console.error('AI Service Error:', error);
    return "I'm having trouble connecting to my service right now.";
  }
};

// AI: Curriculum Generation
export const generateCurriculumWithQuizzes = async (topic, description, numberOfModules = 8, difficulty = 'Beginner') => {
  try {
    const prompt = `Create a ${difficulty} curriculum for "${topic}". Description: ${description}. 
    Return exactly ${numberOfModules} modules in strict JSON:
    {"modules": [{"id": 1, "title": "Module title", "description": "Short description", "subtopics": [{"id": 1, "title": "Subtopic", "description": "Short description"}], "quiz": {"questions": [{"question": "...", "options": ["A","B","C","D"], "correctAnswer": 0}]}}]}`;

    const response = await generateWithModelFallback(prompt, { temperature: 0.7, maxOutputTokens: 2048 });
    const text = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    const data = JSON.parse(text);
    return data.modules;
  } catch (error) {
    console.error('Curriculum Generation Error:', error);
    throw new Error('Failed to generate curriculum.');
  }
};

export const generateCurriculum = generateCurriculumWithQuizzes;

// AI: Adaptive Quiz Generation
export const generateDynamicQuiz = async (
  moduleTitle,
  moduleDescription,
  conversationTranscript,
  adaptiveContext = {},
  companionId = null
) => {
  try {
    const level = adaptiveContext?.difficultyLevel || 'intermediate';
    
    const prompt = `Generate exactly 3 multiple choice questions for ${moduleTitle}. Difficulty: ${level}. 
    Description: ${moduleDescription}. 
    Return only a JSON array: [{"question":"...", "options":["A","B","C","D"], "correctAnswer":0, "explanation":"..."}]`;

    const response = await generateWithModelFallback(prompt, { temperature: 0.7, maxOutputTokens: 2048 });
    const text = response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    const questions = JSON.parse(text);
    return questions.slice(0, 3);
  } catch (error) {
    console.error('Quiz generation failed:', error);
    return null;
  }
};

// AI: Code Review
export const reviewCode = async (code, language, moduleContext = '', lastAiMessage = '') => {
  try {
    const prompt = `You are an expert ${language} coding tutor. Challenge: ${lastAiMessage}. Code: \n\`\`\`${language}\n${code}\n\`\`\`\nReturn markdown: **✅ Result: Passed** or **❌ Result: Failed**, plus short feedback.`;

    const response = await generateWithModelFallback(prompt, { temperature: 0.7, maxOutputTokens: 1024 });
    return response.text();
  } catch (error) {
    console.error('Code Review Error:', error);
    return 'Failed to review code.';
  }
}

// Support other functions
export const getTutorDiagnostics = async () => null;
export const evaluateQuizAttempt = async ({ companionId, moduleTitle, score, passed }) => null;
export const getLearningProgressSummary = async (companionId) => null;
