import {
    buildRelevantMemoryContext,
    getUserLearningMemory,
    updateLearningMemoryAfterTurn,
} from './memory';
import { buildLearningAgentDirectives } from './learningAgent';
import { decideAndRunAgentTools } from './agentTools';
import {
    buildReasoningContext,
    getReasoningState,
    updateReasoningStateAfterTurn,
} from './reasoningState';
import {
    buildDeveloperPrompt,
    buildSystemPrompt,
    buildUserPromptParts,
    composeHiddenInstruction,
} from './promptArchitecture';
import {
    buildCacheKey,
    getCachedResponse,
    getGenerationBudget,
    selectModelFromAvailable,
    setCachedResponse,
    trimConversationForBudget,
} from './aiOptimization';

let cachedModelName = null;

export const generateAIResponse = async (
    userMessage,
    companion,
    conversationHistory = [],
    onStreamChunk = null,
    currentModule = null,
    fileData = null,
    memoryMeta = {}
) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Gemini API key not found");
        return "AI service is not configured.";
    }

    try {
        // 1. DYNAMIC MODEL DISCOVERY
        if (!cachedModelName) {
            console.log("Discovering available Gemini models...");
            const listResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );

            if (!listResponse.ok) {
                if (listResponse.status === 403) {
                    throw new Error("ACCESS_DENIED");
                }
                throw new Error(`Failed to list models: ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const availableModels = listData.models || [];

            const generateModels = availableModels.filter(m =>
                m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
            );

            if (generateModels.length === 0) {
                throw new Error("NO_MODELS_FOUND");
            }

            console.log("Available generation models:", generateModels.map(m => m.name));

            cachedModelName = selectModelFromAvailable(generateModels, { userMessage, fileData });
            console.log(`Selected model: ${cachedModelName} `);
        }

        // 3. GENERATION
        const model = cachedModelName;
        const version = "v1beta";

        console.log(`Generating with ${model}...`);

        const userMemory = await getUserLearningMemory(memoryMeta.userId, companion?.id || memoryMeta.companionId);
        const reasoningState = await getReasoningState(memoryMeta.userId, companion?.id || memoryMeta.companionId);
        const memoryContext = buildRelevantMemoryContext(userMemory, {
            userMessage,
            currentModule,
        });
        const reasoningContext = buildReasoningContext(reasoningState, currentModule);
        const learningAgentDirectives = buildLearningAgentDirectives({
            userMessage,
            companion,
            memory: userMemory,
            currentModule,
            conversationHistory,
        });
        const { toolCalls, toolContext } = decideAndRunAgentTools({
            userMessage,
            currentModule,
            memory: userMemory,
            fileData,
            conversationHistory,
        });

        const systemPrompt = buildSystemPrompt({
            companion,
            currentModule,
            hasHistory: conversationHistory.length > 0,
        });
        const developerPrompt = buildDeveloperPrompt({
            memoryContext,
            learningAgentDirectives,
            toolCalls,
            toolContext,
            reasoningContext,
        });
        const systemPromptText = composeHiddenInstruction({
            systemPrompt,
            developerPrompt,
        });
        const userParts = buildUserPromptParts({ userMessage, fileData });
        const budget = getGenerationBudget({ userMessage, conversationHistory });
        const trimmedHistory = trimConversationForBudget(conversationHistory, budget.historyTurns);
        const cacheKey = buildCacheKey({
            userId: memoryMeta.userId,
            companionId: companion?.id || memoryMeta.companionId,
            moduleId: currentModule?.id || '',
            userMessage,
        });
        const diagnostics = {
            model,
            budget,
            toolCalls,
            hasMemoryContext: Boolean(memoryContext),
            hasReasoningContext: Boolean(reasoningContext),
            cacheKey,
        };
        if (typeof memoryMeta?.onDiagnostics === 'function') {
            try {
                memoryMeta.onDiagnostics(diagnostics);
            } catch (diagErr) {
                console.warn('Diagnostics callback failed:', diagErr);
            }
        }

        const cached = getCachedResponse(cacheKey);
        if (cached) {
            if (typeof memoryMeta?.onDiagnostics === 'function') {
                try {
                    memoryMeta.onDiagnostics({ ...diagnostics, cacheHit: true });
                } catch (diagErr) {
                    console.warn('Diagnostics callback failed:', diagErr);
                }
            }
            if (onStreamChunk) {
                for (const word of cached.split(" ")) {
                    onStreamChunk(word + " ");
                    await new Promise(r => setTimeout(r, 10));
                }
            }
            return cached;
        }

        const requestBody = {
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPromptText }],
            },
            contents: [
                ...trimmedHistory.map(msg => {
                    // Safely extract string content from history just in case object was saved
                    const safeContent = typeof msg.content === 'string' ? msg.content : (msg.content?.text || JSON.stringify(msg.content));
                    return {
                        role: msg.role === "assistant" ? "model" : "user",
                        parts: [{ text: safeContent }],
                    };
                }),
                { role: "user", parts: userParts },
            ],
            generationConfig: {
                temperature: companion.style === "formal" ? Math.min(0.8, budget.temperature) : budget.temperature,
                maxOutputTokens: budget.maxOutputTokens,
            },
        };

        // Retry Logic
        let response;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                response = await fetch(
                    `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(requestBody),
                    }
                );

                if (response.ok) break;

                if (response.status === 429 || response.status === 503) {
                    console.warn(`Attempt ${attempt + 1} failed with ${response.status}. Retrying in 4s...`);
                    if (attempt === 0) await new Promise(r => setTimeout(r, 4000));
                    continue;
                }

                break;

            } catch (netErr) {
                console.warn("Network error during generation:", netErr);
                if (attempt === 0) await new Promise(r => setTimeout(r, 4000));
            }
        }

        if (!response || !response.ok) {
            if (response && response.status === 404) {
                cachedModelName = null;
                return "I lost connection to my model. Please try again.";
            }

            if (response && response.status === 429) {
                return "I'm receiving too many messages right now (Rate Limit). Please wait a few seconds so I can catch up.";
            }

            const data = (response && await response.json().catch(() => ({}))) || {};
            console.error("Gemini Generation Error:", data);
            throw new Error(`API Error ${response ? response.status : 'Unknown'}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!text) throw new Error("Empty Gemini response");
        setCachedResponse(cacheKey, text);

        await updateLearningMemoryAfterTurn({
            userId: memoryMeta.userId,
            companionId: companion?.id || memoryMeta.companionId,
            companion,
            userMessage,
            assistantMessage: text,
            currentModule,
        });
        await updateReasoningStateAfterTurn({
            userId: memoryMeta.userId,
            companionId: companion?.id || memoryMeta.companionId,
            currentModule,
            userMessage,
            assistantMessage: text,
        });

        // Simulated streaming
        if (onStreamChunk) {
            for (const word of text.split(" ")) {
                onStreamChunk(word + " ");
                await new Promise(r => setTimeout(r, 20));
            }
        }

        return text;

    } catch (err) {
        console.error("AI Service Error:", err);
        if (err.message === "ACCESS_DENIED") {
            return `Access Denied. 
      
Your API Key does not have the 'Generative Language API' enabled.
Please check your Google Cloud Console to enable it.`;
        }
        if (err.message === "NO_MODELS_FOUND") {
            return "No compatible AI models found for your API key.";
        }
        return "I'm having trouble connecting to my service right now.";
    }
};

/**
 * Generate curriculum with 8 modules and quizzes
 * @param {string} topic - The main topic
 * @param {string} description - Detailed description
 * @param {number} numberOfModules - Number of modules (default 8)
 * @param {string} difficulty - Difficulty level
 * @returns {Promise<Array>} Array of curriculum modules with quizzes
 */
export const generateCurriculumWithQuizzes = async (topic, description, numberOfModules = 8, difficulty = 'Beginner') => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("AI service is not configured.");
    }

    try {
        if (!cachedModelName) {
            const listResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
            );

            if (!listResponse.ok) {
                throw new Error(`Failed to list models: ${listResponse.status}`);
            }

            const listData = await listResponse.json();
            const availableModels = listData.models || [];
            const generateModels = availableModels.filter(m =>
                m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
            );

            if (generateModels.length === 0) {
                throw new Error("NO_MODELS_FOUND");
            }

            const preferredModel = generateModels.find(m => m.name.includes("gemini-2.5-flash")) ||
                generateModels.find(m => m.name.includes("gemini-2.0-flash")) ||
                generateModels.find(m => m.name.includes("gemini-1.5-flash")) ||
                generateModels[0];

            cachedModelName = preferredModel.name.replace("models/", "");
        }

        const model = cachedModelName;
        const version = "v1beta";
        const cappedModules = Math.min(numberOfModules, 10); // Scale up to 10 modules

        const prompt = `Create a ${difficulty} level learning curriculum for: "${topic}"

Description: ${description}

Generate EXACTLY ${cappedModules} progressive modules. Each module MUST contain exactly 4 subtopics.

IMPORTANT: Each module must have a UNIQUE, SPECIFIC title. DO NOT use generic titles like "Module 1".

Return ONLY valid JSON:
{
  "modules": [
    {
      "id": 1,
      "title": "Module Title",
      "description": "Short description",
      "subtopics": [
        { "id": 1, "title": "Subtopic title", "description": "Short description" },
        { "id": 2, "title": "Subtopic title", "description": "Short description" },
        { "id": 3, "title": "Subtopic title", "description": "Short description" },
        { "id": 4, "title": "Subtopic title", "description": "Short description" }
      ],
      "quiz": {
        "questions": [
          { "question": "?", "options": ["A","B","C","D"], "correctAnswer": 0 }
        ]
      }
    }
  ]
}

Requirements:
- ${cappedModules} modules total
- Each module: UNIQUE title, short description, exactly 4 subtopics
- Subtopics must be granular learning objectives
- Each quiz: EXACTLY 1 multiple-choice question (no explanation needed)
- Progressive difficulty
- Keep ALL descriptions under 12 words to save space`;

        const requestBody = {
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            },
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            throw new Error(`API Error ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!text) throw new Error("Empty response");

        // Parse JSON
        let jsonStr = text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        let curriculum;
        try {
            curriculum = JSON.parse(jsonStr);
        } catch (parseError) {
            console.warn("Curriculum JSON parse failed, attempting aggressive recovery...");
            // Aggressively recover truncated JSON by trimming chars from the end and appending closures
            let recovered = false;
            let strToFix = jsonStr;
            
            // Try up to 250 times (trimming up to 250 chars)
            for (let i = 0; i < 250; i++) {
                if (strToFix.length < 10) break;
                
                // Add quotes if we split in middle of a string, or close open arrays/objects
                const closures = [
                    '', '}', ']}', '}]}', ']}]}', '"}', '"]}', '"}]}', '"]}]}'
                ];
                
                for (const suffix of closures) {
                    try {
                        curriculum = JSON.parse(strToFix + suffix);
                        recovered = true;
                        break;
                    } catch(e) { /* ignore */ }
                }
                
                if (recovered) break;
                // Trim one char from the end
                strToFix = strToFix.slice(0, -1);
            }
            
            if (!recovered) {
                console.error("Aggressive JSON recovery failed for payload size:", jsonStr.length);
                throw new Error("Could not parse or recover JSON: " + parseError.message);
            } else {
                console.log("Curriculum JSON successfully recovered via aggressive trimming.");
            }
        }

        if (!curriculum.modules || !Array.isArray(curriculum.modules)) {
            throw new Error('Invalid curriculum structure');
        }

        return curriculum.modules;

    } catch (err) {
        console.error("Curriculum Generation Error:", err);
        throw new Error('Failed to generate curriculum. Please try again.');
    }
};

// Keep original for compatibility
export const generateCurriculum = generateCurriculumWithQuizzes;

/**
 * Reviews user code using Gemini API for the Code Sandbox feature.
 * 
 * @param {string} code - The code to review
 * @param {string} language - The programming language
 * @param {string} moduleContext - The current learning module context
 * @param {string} lastAiMessage - The latest task/challenge the AI gave the user
 * @returns {Promise<string>} - Markdown formatted review
 */
export const reviewCode = async (code, language, moduleContext = '', lastAiMessage = '') => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("API key is missing");

        // Try to use flash models for speed, fallback to default
        let cachedModelName = "gemini-1.5-flash";
        
        try {
            const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (listResponse.ok) {
                const listData = await listResponse.json();
                const availableModels = listData.models || [];
                const generateModels = availableModels.filter(m => 
                    m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
                );
                
                const preferredModel = generateModels.find(m => m.name.includes("gemini-2.5-flash")) ||
                                     generateModels.find(m => m.name.includes("gemini-2.0-flash")) ||
                                     generateModels.find(m => m.name.includes("gemini-1.5-flash"));
                                     
                if (preferredModel) {
                    cachedModelName = preferredModel.name.replace("models/", "");
                }
            }
        } catch (e) {
            console.warn("Could not list models for code review, using default", e);
        }

        const prompt = `You are an expert ${language} coding tutor. 
Please review the following code submitted by a student.
${moduleContext ? `\nContext: The student is learning: ${moduleContext}\n` : ''}
${lastAiMessage ? `\nChallenge Assigned: You recently asked the student to do this:\n"${lastAiMessage}"\n` : ''}

Code to review:
\`\`\`${language}
${code}
\`\`\`

Evaluate if the supplied code correctly accomplishes the task/challenge you assigned. Keep your feedback ULTRA-SHORT (max 2-3 sentences).

Format your Markdown response rigidly like this:
**✅ Result: Passed** (or **❌ Result: Failed**)
**Hint/Feedback:** [1 brief sentence exactly explaining why or what to fix]
**Next Step:** [1 brief sentence guiding them back to the chat or giving the answer if they are stuck]

DO NOT write a long essay. Keep the review incredibly concise.`;

        const requestBody = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.4, // Lower temperature for more factual code review
                maxOutputTokens: 2000,
            },
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${cachedModelName}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            throw new Error(`API Error ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error("Empty response from AI");

        return text;

    } catch (err) {
        console.error("Code Review Error:", err);
        throw new Error('Failed to review code. Please try again.');
    }
};

/**
 * Generates an interactive Multiple Choice Quiz based on the exact user conversation.
 * 
 * @param {string} moduleTitle - Topic info
 * @param {string} moduleDescription - Context info
 * @param {string} conversationTranscript - The raw string representation of the session
 * @returns {Promise<Array>} - Array of 3 Question Objects
 */
export const generateDynamicQuiz = async (
    moduleTitle,
    moduleDescription,
    conversationTranscript,
    adaptiveContext = {}
) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API key is missing");

    try {
        const level = adaptiveContext?.difficultyLevel || 'intermediate';
        const weakTopics = Array.isArray(adaptiveContext?.weakTopics) ? adaptiveContext.weakTopics.slice(0, 3) : [];
        const prompt = `You are a strict JSON generator.
Generate a 3-question Multiple Choice Quiz based EXACTLY on this user's conversation transcript about: ${moduleTitle} (${moduleDescription}).
Difficulty level: ${level}.
Weak topics to target (if relevant): ${weakTopics.length ? weakTopics.join(', ') : 'none'}.

Transcript of what the user learned:
${conversationTranscript || 'No transcript available. Generate a generic quiz about the topic.'}

Return ONLY a valid JSON array of 3 objects. Do NOT wrap it in markdown blockquotes like \`\`\`json.
Each object must have the exact structure:
[
  {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0, // The integer index of the correct option (0-3)
    "explanation": "One-line explanation"
  }
]

Rules:
- exactly 3 questions
- exactly 4 options each
- keep language concise
- ensure one clear correct answer per question`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.2 },
                })
            }
        );

        if (!response.ok) throw new Error("Dynamic quiz generation failed");

        const data = await response.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        // Clean markdown
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed.slice(0, 3).map((q) => ({
            question: q.question,
            options: Array.isArray(q.options) ? q.options.slice(0, 4) : [],
            correctAnswer: Number.isInteger(q.correctAnswer) ? q.correctAnswer : 0,
            explanation: q.explanation || '',
        }));
    } catch (e) {
        console.error("Quiz generation parsings failed:", e);
        return null;
    }
};
