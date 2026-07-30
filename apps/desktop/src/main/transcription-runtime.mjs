import {
  createTranscriptionFixtureProvider,
  loadTranscriptionFixture,
} from './transcription-fixture-provider.mjs';
import {
  createTranscriptionJobStore,
  defaultTranscriptionJobsPath,
} from './transcription-job-store.mjs';
import { createTranscriptionJobRunner } from './transcription-job-runner.mjs';
import { transcriptionFeatureEnabled } from './transcription-policy.mjs';
import { createTranscriptionService } from './transcription-service.mjs';
import { createWhisperCppProvider } from './whisper-cpp-provider.mjs';
import { createSonaProvider } from './sona-provider.mjs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function firstReadable(paths) {
  for (const path of paths) {
    if (!path) continue;
    try {
      await access(path);
      return path;
    } catch {
      // Try the next conventional local model location.
    }
  }
  return null;
}

async function resolveSonaModelPath(environment) {
  return await firstReadable([
    environment.ROUGH_CUT_SONA_MODEL_PATH,
    join(
      homedir(),
      '.local',
      'share',
      'github.com.thewh1teagle.vibe',
      'ggml-model.bin',
    ),
    join(
      homedir(),
      'Library',
      'Application Support',
      'github.com.thewh1teagle.vibe',
      'ggml-model.bin',
    ),
  ]);
}

export async function createTranscriptionRuntime({
  environment = process.env,
  userDataDir,
  onLog = () => undefined,
  persistTranscript = null,
  createLocalProvider = createWhisperCppProvider,
  createFallbackProvider = createSonaProvider,
  resolveFallbackModel = resolveSonaModelPath,
}) {
  const enabled = transcriptionFeatureEnabled(environment);
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      fixtureDurationMs: null,
      incrementalDuringCapture: false,
      service: null,
      dispose: () => undefined,
    };
  }

  let fixtureProvider = null;
  const fixturePath = environment.ROUGH_CUT_TRANSCRIPTION_FIXTURE_PATH;
  if (fixturePath) {
    try {
      fixtureProvider = createTranscriptionFixtureProvider(
        await loadTranscriptionFixture(fixturePath),
      );
    } catch (error) {
      onLog(`[transcription] fixture unavailable: ${error?.message ?? error}`);
    }
  }

  let localProvider = fixtureProvider;
  const modelPath = environment.ROUGH_CUT_WHISPER_MODEL_PATH;
  if (!localProvider && modelPath) {
    try {
      localProvider = await createLocalProvider({
        command: environment.ROUGH_CUT_WHISPER_COMMAND || 'whisper-cli',
        modelPath,
        ffmpegPath: environment.ROUGH_CUT_FFMPEG_COMMAND || 'ffmpeg',
        language: environment.ROUGH_CUT_TRANSCRIPTION_LANGUAGE || 'auto',
      });
    } catch (error) {
      onLog(`[transcription] whisper.cpp unavailable: ${error?.message ?? error}`);
    }
  }
  if (!localProvider) {
    const sonaModelPath = await resolveFallbackModel(environment);
    if (sonaModelPath) {
      try {
        localProvider = await createFallbackProvider({
          command: environment.ROUGH_CUT_SONA_COMMAND || 'sona',
          modelPath: sonaModelPath,
          ffmpegPath: environment.ROUGH_CUT_FFMPEG_COMMAND || 'ffmpeg',
          language: environment.ROUGH_CUT_TRANSCRIPTION_LANGUAGE || 'auto',
        });
      } catch (error) {
        onLog(`[transcription] Sona unavailable: ${error?.message ?? error}`);
      }
    }
  }

  const store = createTranscriptionJobStore({
    filePath: defaultTranscriptionJobsPath(userDataDir),
    onLog,
  });
  const runner = createTranscriptionJobRunner({
    store,
    transcribeChunk:
      localProvider?.transcribeChunk ??
      (async () => {
        throw new Error('No local transcription provider is available');
      }),
    onStateChange: (job) =>
      onLog(
        `[transcription] job=${job.id} status=${job.status} checkpointMs=${job.checkpointMs}`,
      ),
  });
  const service = createTranscriptionService({
    enabled: true,
    store,
    runner,
    localProvider: localProvider?.descriptor ?? null,
    cloudEnabled: false,
    persistTranscript,
  });

  return {
    enabled: true,
    available: Boolean(localProvider),
    fixtureDurationMs: fixtureProvider?.durationMs ?? null,
    incrementalDuringCapture: localProvider?.incrementalDuringCapture !== false,
    service,
    dispose: () => localProvider?.dispose?.(),
  };
}
