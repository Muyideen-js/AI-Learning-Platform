// Edge TTS Helper - Provides natural Microsoft neural voices
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Generate speech using Microsoft Edge TTS
 * @param {string} text - Text to convert to speech
 * @param {string} voice - Voice name (default: en-US-AriaNeural)
 * @returns {Promise<string>} - Path to generated audio file
 */
export async function generateEdgeTTS(text, voice = 'en-US-AriaNeural') {
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        // Generate unique filename
        const filename = `speech_${Date.now()}.mp3`;
        const outputPath = path.join(tempDir, filename);

        // Run edge-tts command
        const command = `edge-tts --voice "${voice}" --text "${text.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;
        await execAsync(command);

        return outputPath;
    } catch (error) {
        console.error('Edge TTS error:', error);
        throw error;
    }
}

/**
 * Available high-quality voices
 */
export const EDGE_VOICES = {
    // US English - Natural and clear
    ARIA: 'en-US-AriaNeural',        // Female, friendly
    GUY: 'en-US-GuyNeural',          // Male, professional
    JENNY: 'en-US-JennyNeural',      // Female, warm
    DAVIS: 'en-US-DavisNeural',      // Male, conversational

    // UK English
    SONIA: 'en-GB-SoniaNeural',      // Female, British
    RYAN: 'en-GB-RyanNeural',        // Male, British

    // Australian English
    NATASHA: 'en-AU-NatashaNeural',  // Female, Australian
    WILLIAM: 'en-AU-WilliamNeural',  // Male, Australian
};
