let cachedModelName = null;

export const generateAIResponse = async (
    userMessage,
    companion,
    conversationHistory = [],
    onStreamChunk = null,
    currentModule = null,
    fileData = null
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

            const preferredModel = generateModels.find(m => m.name.includes("gemini-2.5-flash")) ||
                generateModels.find(m => m.name.includes("gemini-2.0-flash")) ||
                generateModels.find(m => m.name.includes("gemini-1.5-flash")) ||
                generateModels.find(m => m.name.includes("gemini-1.5-pro")) ||
                generateModels[0];

            cachedModelName = preferredModel.name.replace("models/", "");
            console.log(`Selected model: ${cachedModelName} `);
        }

        // 3. GENERATION
        const model = cachedModelName;
        const version = "v1beta";

        console.log(`Generating with ${model}...`);

        const systemPromptText = `You are ${companion.name}, a ${companion.style === "formal"
            ? "professional and knowledgeable"
            : "friendly and approachable"
            } ${companion.subject} tutor who teaches ${companion.topic}.
${currentModule ? `
Current Focus: Module ${currentModule.id} - ${currentModule.title}
${currentModule.description}
Focus your teaching on this specific module topic.
` : ''
            }
Speak naturally like a real human tutor.
Be warm, engaging, and conversational.
Avoid robotic or repetitive phrases.

TEACHING METHOD:
1. EXPLAIN STEP-BY-STEP: Break down complex topics into small, digestible parts. Do NOT dump a wall of text.
2. CHECK FOR UNDERSTANDING: After explaining a concept, ask: "Do you understand this stage?"
3. ASSIGN QUICK TASKS: Periodically give the user a quick, mini coding challenge or task to try in their Code Sandbox (e.g. "Quickly write a function that..."). Let them know they can click 'Check My Code' to have you review their solution.
4. WAIT FOR CONFIRMATION: Do not proceed to the next step until the user responds or submits their task.

If this is the VERY FIRST message of the session(conversation history is empty), say exactly:
        "Welcome! Are you ready to start the course on ${companion.topic}? Say 'Start' when you are ready!"
Only proceed with the first lesson after they confirm.`;

        let userParts = [{ text: userMessage || 'Analyze this file' }];
        
        if (fileData) {
            if (fileData.type === 'image') {
                // Gemini Vision: pass base64 directly
                userParts.unshift({
                    inlineData: {
                        data: fileData.base64,
                        mimeType: fileData.mimeType
                    }
                });
            } else if (fileData.type === 'text') {
                // Text files: inject raw text directly into the prompt
                userParts[0].text = `[Attached File: ${fileData.name}]\n\nFile Content:\n\`\`\`\n${fileData.content}\n\`\`\`\n\nUser Question:\n${userMessage || 'Please analyze this file.'}`;
            }
        }

        const requestBody = {
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPromptText }],
            },
            contents: [
                ...conversationHistory.slice(-10).map(msg => {
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
                temperature: companion.style === "formal" ? 0.85 : 0.9,
                maxOutputTokens: 800,
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

        const prompt = `Create a ${difficulty} level learning curriculum for: "${topic}"

Description: ${description}

Generate EXACTLY ${numberOfModules} progressive modules with quizzes.

IMPORTANT: Each module must have a UNIQUE, SPECIFIC title that describes what will be learned in that module. DO NOT use generic titles like "Module 1: Module 1" or "Learning html basics - Part 1".

Example of GOOD module titles for "HTML Basics":
- "Introduction to HTML Structure and Tags"
- "Working with Text, Links, and Images"
- "Creating Forms and Input Elements"
- "Semantic HTML and Accessibility"

Return ONLY valid JSON (no markdown formatting):
{
  "modules": [
    {
      "id": 1,
      "title": "Specific descriptive title for this module",
      "description": "Clear explanation of what students will learn in this module",
      "quiz": {
        "questions": [
          {
            "question": "Question text?",
            "options": ["A", "B", "C", "D"],
            "correctAnswer": 0,
            "explanation": "Why correct"
          }
        ]
      }
    }
  ]
}

Requirements:
- ${numberOfModules} modules total
- Each module: UNIQUE, SPECIFIC title (not generic), detailed description
- Each quiz: 5 multiple-choice questions
- Progressive difficulty from basics to advanced
- Titles should clearly indicate the specific topic covered in each module`;

        const requestBody = {
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 3000,
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

        // Parse JSON using Regex to bypass markdown and conversational wrap
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Could not find JSON object in response");
        }
        const curriculum = JSON.parse(jsonMatch[0]);

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

Evaluate if the supplied code correctly accomplishes the task/challenge you assigned. Provide a helpful, encouraging, and educational review formatted in Markdown. 
Include:
1. **Grade/Assessment**: Did they pass the challenge? (e.g., "✅ Passed!", "❌ Needs work").
2. **What works well**: Point out 1-2 good things they did.
3. **Issues/Bugs**: Point out any syntax errors, logic bugs, or if they failed to solve the challenge.
4. **Suggestions**: Provide 1-2 concrete ways to improve or fix the code.
5. **Fixed Code**: (Optional) If there were issues, provide the corrected code snippet.

Keep your tone friendly and constructive, as if speaking to a beginner. Keep the review concise.`;

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
