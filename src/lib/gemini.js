let cachedModelName = null;

export const generateAIResponse = async (
    userMessage,
    companion,
    conversationHistory = [],
    onStreamChunk = null,
    currentModule = null
) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Gemini API key not found");
        return "AI service is not configured.";
    }

    try {
        // 1. DYNAMIC MODEL DISCOVERY
        // If we haven't found a working model yet, ask the API what's available.
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

            // Filter for models that support generateContent
            const generateModels = availableModels.filter(m =>
                m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
            );

            if (generateModels.length === 0) {
                throw new Error("NO_MODELS_FOUND");
            }

            console.log("Available generation models:", generateModels.map(m => m.name));

            // 2. INTELLIGENT SELECTION
            // Priority: 2.5 (Newest) -> 2.0 -> 1.5 -> Any
            // Note: model names actally look like "models/gemini-1.5-flash"
            const preferredModel = generateModels.find(m => m.name.includes("gemini-2.5-flash")) ||
                generateModels.find(m => m.name.includes("gemini-2.0-flash")) ||
                generateModels.find(m => m.name.includes("gemini-1.5-flash")) ||
                generateModels.find(m => m.name.includes("gemini-1.5-pro")) ||
                generateModels[0];

            cachedModelName = preferredModel.name.replace("models/", ""); // Strip prefix if present
            console.log(`Selected model: ${cachedModelName}`);
        }

        // 3. GENERATION
        const model = cachedModelName;
        const version = "v1beta"; // almost all modern models use v1beta

        console.log(`Generating with ${model}...`);

        const systemPromptText = `You are ${companion.name}, a ${companion.style === "formal"
            ? "professional and knowledgeable"
            : "friendly and approachable"
            } ${companion.subject} tutor who teaches ${companion.topic}.
${currentModule ? `
Current Focus: Module ${currentModule.id} - ${currentModule.title}
${currentModule.description}
Focus your teaching on this specific module topic.
` : ''}
Speak naturally like a real human tutor.
Be warm, engaging, and conversational.
Avoid robotic or repetitive phrases.

TEACHING METHOD:
1. EXPLAIN STEP-BY-STEP: Break down complex topics into small, digestible parts. do NOT dump a wall of text.
2. CHECK FOR UNDERSTANDING: After explaining a concept, ALWAYS ask: "Do you understand this stage, or should I explain more in details?" or "Do you have a question, or should I continue?"
3. WAIT FOR CONFIRMATION: Do not proceed to the next step until the user confirms (e.g., "Yes", "Continue", "Understand").
4. INTERACTIVE: Ask thought-provoking questions to keep the user engaged.

If this is the VERY FIRST message of the session (conversation history is empty), say exactly:
"Welcome! Are you ready to start the course on ${companion.topic}? Say 'Start' when you are ready!"
Only proceed with the first lesson after they confirm.`;

        const requestBody = {
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPromptText }],
            },
            contents: [
                ...conversationHistory.slice(-10).map(msg => ({
                    role: msg.role === "assistant" ? "model" : "user",
                    parts: [{ text: msg.content }],
                })),
                { role: "user", parts: [{ text: userMessage }] },
            ],
            generationConfig: {
                temperature: companion.style === "formal" ? 0.85 : 0.9,
                maxOutputTokens: 800,
            },
        };

        // Retry Logic for Rate Limits (429) & Server Overload (503)
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

                // If success, break loop
                if (response.ok) break;

                // If Rate Limit (429) or Service Unavailable (503), wait and retry
                if (response.status === 429 || response.status === 503) {
                    console.warn(`Attempt ${attempt + 1} failed with ${response.status}. Retrying in 4s...`);
                    if (attempt === 0) await new Promise(r => setTimeout(r, 4000)); // Wait 4s
                    continue;
                }

                // Other errors (e.g. 400, 404), break immediately
                break;

            } catch (netErr) {
                console.warn("Network error during generation:", netErr);
                if (attempt === 0) await new Promise(r => setTimeout(r, 4000));
            }
        }

        if (!response || !response.ok) {
            // If 404, maybe our cached model invalid? Reset cache.
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
 * Generate a structured curriculum for a companion using AI
 * @param {string} subject - The subject area (e.g., "HTML", "Math")
 * @param {string} topic - Detailed topic description
 * @returns {Promise<Array>} Array of curriculum modules
 */
export const generateCurriculum = async (subject, topic) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Gemini API key not found");
        throw new Error("AI service is not configured.");
    }

    try {
        // Use cached model if available
        if (!cachedModelName) {
            // Discover models first
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

        const prompt = `You are a curriculum designer. Create a structured learning path for teaching ${subject}: ${topic}.

Generate 5-8 course modules that progressively build knowledge from beginner to intermediate level.

Return ONLY a valid JSON array (no markdown, no explanation) with this exact structure:
[
  {
    "id": 1,
    "title": "Module Title",
    "description": "Brief description of what students will learn",
    "order": 1
  }
]

Requirements:
- Each module should be focused and achievable in 5-10 minutes
- Titles should be clear and concise (max 6 words)
- Descriptions should be 1 sentence
- Order should be sequential (1, 2, 3...)
- Start with fundamentals, progress to more advanced topics`;

        const requestBody = {
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1500,
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

        if (!text) throw new Error("Empty response from AI");

        // Parse JSON response
        // Remove markdown code blocks if present
        const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const curriculum = JSON.parse(cleanedText);

        // Validate structure
        if (!Array.isArray(curriculum) || curriculum.length === 0) {
            throw new Error("Invalid curriculum format");
        }

        // Ensure all required fields exist
        const validatedCurriculum = curriculum.map((module, index) => ({
            id: module.id || index + 1,
            title: module.title || `Module ${index + 1}`,
            description: module.description || "Learn new concepts",
            order: module.order || index + 1
        }));

        return validatedCurriculum;

    } catch (err) {
        console.error("Curriculum Generation Error:", err);

        // Fallback: Generate basic curriculum
        return [
            { id: 1, title: `Introduction to ${subject}`, description: `Learn the basics of ${subject}`, order: 1 },
            { id: 2, title: "Core Concepts", description: "Understand fundamental principles", order: 2 },
            { id: 3, title: "Practical Applications", description: "Apply what you've learned", order: 3 },
            { id: 4, title: "Advanced Topics", description: "Explore more complex ideas", order: 4 },
            { id: 5, title: "Review & Practice", description: "Reinforce your knowledge", order: 5 }
        ];
    }
};
