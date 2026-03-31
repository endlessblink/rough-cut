import { ipcMain } from 'electron';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { IPC_CHANNELS } from '../../shared/ipc-channels.mjs';

const CONFIG_DIR = join(homedir(), '.rough-cut');
const CONFIG_FILE = join(CONFIG_DIR, 'ai-config.json');

// Ensure config dir exists
if (!existsSync(CONFIG_DIR)) {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

/** Read AI config from disk */
async function readConfig() {
  try {
    const data = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { provider: 'groq', apiKeys: {} };
  }
}

/** Write AI config to disk */
async function writeConfig(config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** Extract audio from a video file using FFmpeg */
function extractAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outputPath,
    ]);

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    ffmpeg.on('error', reject);
  });
}

/** Get the API base URL for a provider */
function getProviderBaseUrl(provider) {
  switch (provider) {
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'openai':
      return 'https://api.openai.com/v1';
    default:
      return 'https://api.groq.com/openai/v1';
  }
}

/** Get the model name for a provider */
function getProviderModel(provider) {
  switch (provider) {
    case 'groq':
      return 'whisper-large-v3';
    case 'openai':
      return 'whisper-1';
    default:
      return 'whisper-large-v3';
  }
}

/** Send audio to Whisper API and get word-level transcription */
async function transcribeAudio(audioPath, apiKey, provider) {
  const baseUrl = getProviderBaseUrl(provider);
  const model = getProviderModel(provider);

  const audioBuffer = await readFile(audioPath);
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/** Convert Whisper API response to CaptionSegment[] */
function whisperResponseToCaptions(response, assetId, fps) {
  const words = response.words || [];
  if (words.length === 0) return [];

  // Group words into caption segments (sentences or ~5-second chunks)
  const segments = [];
  let currentWords = [];
  let segmentStart = null;

  for (const word of words) {
    if (segmentStart === null) {
      segmentStart = word.start;
    }
    currentWords.push(word);

    // Break on sentence-ending punctuation or after ~5 seconds
    const elapsed = word.end - segmentStart;
    const endsWithPunctuation = /[.!?]$/.test(word.word.trim());

    if (endsWithPunctuation || elapsed >= 5 || currentWords.length >= 15) {
      const startFrame = Math.round(segmentStart * fps);
      const endFrame = Math.round(word.end * fps);
      const text = currentWords.map(w => w.word).join(' ').trim();

      segments.push({
        id: crypto.randomUUID(),
        assetId,
        status: 'pending',
        confidence: 1,
        startFrame,
        endFrame,
        text,
        words: currentWords.map(w => ({
          word: w.word.trim(),
          startFrame: Math.round(w.start * fps),
          endFrame: Math.round(w.end * fps),
          confidence: 1,
        })),
      });

      currentWords = [];
      segmentStart = null;
    }
  }

  // Flush remaining words
  if (currentWords.length > 0) {
    const firstWord = currentWords[0];
    const lastWord = currentWords[currentWords.length - 1];
    const startFrame = Math.round(firstWord.start * fps);
    const endFrame = Math.round(lastWord.end * fps);
    const text = currentWords.map(w => w.word).join(' ').trim();

    segments.push({
      id: crypto.randomUUID(),
      assetId,
      status: 'pending',
      confidence: 1,
      startFrame,
      endFrame,
      text,
      words: currentWords.map(w => ({
        word: w.word.trim(),
        startFrame: Math.round(w.start * fps),
        endFrame: Math.round(w.end * fps),
        confidence: 1,
      })),
    });
  }

  return segments;
}

let activeAbortController = null;

/** Register all AI-related IPC handlers */
export function registerAIHandlers(mainWindow) {
  // Get API key
  ipcMain.handle(IPC_CHANNELS.AI_GET_API_KEY, async (_event, { provider }) => {
    const config = await readConfig();
    return config.apiKeys?.[provider] || '';
  });

  // Set API key
  ipcMain.handle(IPC_CHANNELS.AI_SET_API_KEY, async (_event, { provider, apiKey }) => {
    const config = await readConfig();
    if (!config.apiKeys) config.apiKeys = {};
    config.apiKeys[provider] = apiKey;
    await writeConfig(config);
    return true;
  });

  // Get provider config
  ipcMain.handle(IPC_CHANNELS.AI_GET_PROVIDER_CONFIG, async () => {
    const config = await readConfig();
    return { provider: config.provider || 'groq' };
  });

  // Set provider config
  ipcMain.handle(IPC_CHANNELS.AI_SET_PROVIDER_CONFIG, async (_event, { provider }) => {
    const config = await readConfig();
    config.provider = provider;
    await writeConfig(config);
    return true;
  });

  // Analyze captions
  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE_CAPTIONS, async (_event, { assets, fps }) => {
    const config = await readConfig();
    const provider = config.provider || 'groq';
    const apiKey = config.apiKeys?.[provider];

    if (!apiKey) {
      throw new Error(`No API key configured for provider "${provider}". Please set your API key in the AI tab settings.`);
    }

    activeAbortController = new AbortController();
    const allSegments = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      if (activeAbortController.signal.aborted) {
        throw new Error('Analysis cancelled');
      }

      // Send progress
      mainWindow?.webContents.send(IPC_CHANNELS.AI_ANALYSIS_PROGRESS, {
        assetId: asset.id,
        stage: 'extracting-audio',
        percent: Math.round((i / assets.length) * 100),
      });

      // Extract audio
      const tempAudioPath = join(CONFIG_DIR, `temp-audio-${asset.id}.wav`);
      try {
        await extractAudio(asset.filePath, tempAudioPath);
      } catch (err) {
        console.error(`[ai-service] Failed to extract audio from ${asset.filePath}:`, err.message);
        continue; // Skip this asset
      }

      if (activeAbortController.signal.aborted) {
        await unlink(tempAudioPath).catch(() => {});
        throw new Error('Analysis cancelled');
      }

      // Send progress
      mainWindow?.webContents.send(IPC_CHANNELS.AI_ANALYSIS_PROGRESS, {
        assetId: asset.id,
        stage: 'transcribing',
        percent: Math.round(((i + 0.5) / assets.length) * 100),
      });

      // Transcribe
      try {
        const whisperResponse = await transcribeAudio(tempAudioPath, apiKey, provider);
        const segments = whisperResponseToCaptions(whisperResponse, asset.id, fps);
        allSegments.push(...segments);
      } catch (err) {
        console.error(`[ai-service] Transcription failed for ${asset.filePath}:`, err.message);
        throw err; // Re-throw — user needs to know
      } finally {
        await unlink(tempAudioPath).catch(() => {});
      }
    }

    activeAbortController = null;

    // Send completion progress
    mainWindow?.webContents.send(IPC_CHANNELS.AI_ANALYSIS_PROGRESS, {
      assetId: null,
      stage: 'complete',
      percent: 100,
    });

    return allSegments;
  });

  // Cancel analysis
  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_ANALYSIS, async () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    return true;
  });
}
