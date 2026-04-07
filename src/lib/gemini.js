import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const callTutorResponse = httpsCallable(functions, 'generateTutorResponse');
const callAdaptiveQuiz = httpsCallable(functions, 'generateAdaptiveQuiz');
const callCodeReview = httpsCallable(functions, 'evaluateCodeSubmission');
const callCurriculum = httpsCallable(functions, 'generateCompanionCurriculum');
const callTutorDiagnostics = httpsCallable(functions, 'getTutorDiagnostics');
const callEvaluateQuizAttempt = httpsCallable(functions, 'evaluateQuizAttempt');
const callLearningProgressSummary = httpsCallable(functions, 'getLearningProgressSummary');

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
    const result = await callTutorResponse({
      userMessage,
      companion,
      conversationHistory,
      currentModule,
      fileData,
      memoryMeta: {
        userId: memoryMeta?.userId || null,
        companionId: memoryMeta?.companionId || null,
      },
    });

    const text = result?.data?.text || "I'm having trouble connecting to my service right now.";
    const diagnostics = result?.data?.diagnostics || null;

    if (diagnostics && typeof memoryMeta?.onDiagnostics === 'function') {
      try {
        memoryMeta.onDiagnostics(diagnostics);
      } catch (diagError) {
        console.warn('Diagnostics callback failed:', diagError);
      }
    }

    if (onStreamChunk && typeof text === 'string') {
      for (const word of text.split(' ')) {
        onStreamChunk(`${word} `);
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
    }

    return text;
  } catch (error) {
    console.error('AI Service Error:', error);
    return "I'm having trouble connecting to my service right now.";
  }
};

export const generateCurriculumWithQuizzes = async (
  topic,
  description,
  numberOfModules = 8,
  difficulty = 'Beginner'
) => {
  try {
    const result = await callCurriculum({
      topic,
      description,
      numberOfModules,
      difficulty,
    });
    const modules = result?.data?.modules;
    if (!Array.isArray(modules)) {
      throw new Error('Invalid curriculum response');
    }
    return modules;
  } catch (error) {
    console.error('Curriculum Generation Error:', error);
    throw new Error('Failed to generate curriculum. Please try again.');
  }
};

export const generateCurriculum = generateCurriculumWithQuizzes;

export const reviewCode = async (code, language, moduleContext = '', lastAiMessage = '') => {
  try {
    const result = await callCodeReview({
      code,
      language,
      moduleContext,
      lastAiMessage,
    });
    const review = result?.data?.review;
    if (!review) {
      throw new Error('Empty response from AI');
    }
    return review;
  } catch (error) {
    console.error('Code Review Error:', error);
    throw new Error('Failed to review code. Please try again.');
  }
};

export const generateDynamicQuiz = async (
  moduleTitle,
  moduleDescription,
  conversationTranscript,
  adaptiveContext = {},
  companionId = null
) => {
  try {
    const result = await callAdaptiveQuiz({
      moduleTitle,
      moduleDescription,
      conversationTranscript,
      adaptiveContext,
      companionId,
    });

    const questions = result?.data?.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      return null;
    }

    return questions.slice(0, 3).map((q) => ({
      question: q.question,
      options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
      correctAnswer: Number.isInteger(q.correctAnswer) ? q.correctAnswer : 0,
      explanation: q.explanation || '',
    }));
  } catch (error) {
    console.error('Quiz generation failed:', error);
    return null;
  }
};

export const getTutorDiagnostics = async () => {
  try {
    const result = await callTutorDiagnostics({});
    return result?.data?.diagnostics || null;
  } catch (error) {
    console.error('Diagnostics fetch failed:', error);
    return null;
  }
};

export const evaluateQuizAttempt = async ({ companionId, moduleTitle, score, passed }) => {
  try {
    const result = await callEvaluateQuizAttempt({ companionId, moduleTitle, score, passed });
    return result?.data || null;
  } catch (error) {
    console.error('Quiz attempt evaluation failed:', error);
    return null;
  }
};

export const getLearningProgressSummary = async (companionId) => {
  try {
    const result = await callLearningProgressSummary({ companionId });
    return result?.data?.summary || null;
  } catch (error) {
    console.error('Progress summary fetch failed:', error);
    return null;
  }
};
