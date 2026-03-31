const safeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const buildSystemPrompt = ({ companion, currentModule, hasHistory }) => `You are ${companion.name}, a ${companion.style === "formal"
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
Keep responses concise - max 3-4 short paragraphs.

TEACHING METHOD:
1. EXPLAIN STEP-BY-STEP: Break down complex topics into small, digestible parts. Do NOT dump a wall of text.
2. PROACTIVE TASKS: You MUST proactively weave mini coding challenges or exercises into your teaching every 2-3 responses WITHOUT the user asking.
3. WAIT FOR CONFIRMATION: Do not proceed to the next step until the user responds or submits their task.
4. ASSESSMENT LOCK: If you have given a task and the user hasn't completed it correctly, DO NOT let them change the topic.
5. PROGRESSIVE DIFFICULTY: Start simple and gradually increase complexity.
6. DIAGRAMS: When explaining architectures or flows, use mermaid code blocks.

${!hasHistory ? "If this is the VERY FIRST message of the session, start teaching immediately with one micro-task." : ""}`;

export const buildDeveloperPrompt = ({
  memoryContext,
  learningAgentDirectives,
  toolCalls,
  toolContext,
  reasoningContext,
}) => `MEMORY CONTEXT (use only if relevant):
${memoryContext || 'No prior memory available.'}

Memory usage rules:
- Use memory to personalize explanations, pacing, and examples.
- If a weak topic appears, revisit it briefly before moving on.
- Do NOT mention internal memory system or raw metadata to the student.

${learningAgentDirectives}

INTERNAL TOOL ORCHESTRATION:
- Tools selected for this turn: ${toolCalls.length ? toolCalls.join(', ') : 'none'}.
- Use tool outputs only as hidden guidance for the final reply.
- Do not mention tool names in user-facing text.

TOOL OUTPUTS:
${toolContext}

REASONING STATE MEMORY:
${reasoningContext}`;

export const buildUserPromptParts = ({ userMessage, fileData }) => {
  const parts = [{ text: userMessage || 'Analyze this file' }];

  if (!fileData) return parts;

  if (fileData.type === 'image') {
    parts.unshift({
      inlineData: {
        data: fileData.base64,
        mimeType: fileData.mimeType,
      },
    });
    return parts;
  }

  if (fileData.type === 'text') {
    parts[0].text = `[Attached File: ${fileData.name}]

File Content:
\`\`\`
${safeText(fileData.content)}
\`\`\`

User Question:
${userMessage || 'Please analyze this file.'}`;
  }

  return parts;
};

export const composeHiddenInstruction = ({ systemPrompt, developerPrompt }) =>
  `${systemPrompt}

--- DEVELOPER INSTRUCTIONS (HIDDEN) ---
${developerPrompt}`;
