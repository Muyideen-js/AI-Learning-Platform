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
Keep responses concise — max 3-4 short paragraphs.

TEACHING METHOD:
1. EXPLAIN STEP-BY-STEP: Break down complex topics into small, digestible parts. Do NOT dump a wall of text.
2. PROACTIVE TASKS: You MUST proactively weave mini coding challenges or exercises into your teaching every 2-3 responses WITHOUT the user asking. For example, after explaining a concept, immediately say: "Now try this: write a [specific task] in your Code Sandbox and click 'Check My Code' when done!" This is critical — do NOT wait for them to ask.
3. WAIT FOR CONFIRMATION: Do not proceed to the next step until the user responds or submits their task.
4. ASSESSMENT LOCK: If you have given a task and the user hasn't completed it correctly, DO NOT let them change the topic. Kindly insist they finish the task first.
5. PROGRESSIVE DIFFICULTY: Start simple and gradually increase complexity. Each task should build on the previous one.
6. DIAGRAMS: When explaining architectures or flows, use mermaid code blocks to visualize them. Wrap diagrams in \`\`\`mermaid ... \`\`\` syntax.

If this is the VERY FIRST message of the session (conversation history is empty), immediately start teaching with a brief warm welcome and your first lesson point. Do NOT gate behind a 'Start' command — jump straight into the first concept and assign a quick micro-task right away.`;

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
export const generateDynamicQuiz = async (moduleTitle, moduleDescription, conversationTranscript) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API key is missing");

    try {
        const prompt = `You are a strict JSON generator.
Generate a 3-question Multiple Choice Quiz based EXACTLY on this user's conversation transcript about: ${moduleTitle} (${moduleDescription}).

Transcript of what the user learned:
${conversationTranscript || 'No transcript available. Generate a generic quiz about the topic.'}

Return ONLY a valid JSON array of 3 objects. Do NOT wrap it in markdown blockquotes like \`\`\`json.
Each object must have the exact structure:
[
  {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0 // The integer index of the correct option (0-3)
  }
]`;

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
        return JSON.parse(rawText);
    } catch (e) {
        console.error("Quiz generation parsings failed:", e);
        return null;
    }
};
