import { execFile } from 'node:child_process';

export async function listPulseAudioMicSources({ run = execFile } = {}) {
  const stdout = await runPactl(run);
  return parsePulseAudioSources(stdout).filter((source) => !source.monitor);
}

export async function listPulseAudioSystemAudioSources({ run = execFile } = {}) {
  const stdout = await runPactl(run);
  return parsePulseAudioSources(stdout).filter((source) => source.monitor);
}

export function parsePulseAudioSources(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parsePulseAudioSourceLine)
    .filter(Boolean);
}

function parsePulseAudioSourceLine(line) {
  const parts = line.split(/\t+/);
  if (parts.length < 2) return null;
  const id = parts[0];
  const name = parts[1];
  const driver = parts[2] ?? '';
  const state = parts[4] ?? '';
  return {
    id,
    name,
    label: labelForSourceName(name),
    driver,
    state,
    monitor: name.endsWith('.monitor'),
  };
}

function runPactl(run) {
  return new Promise((resolve, reject) => {
    run('pactl', ['list', 'sources', 'short'], (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout ?? ''));
    });
  });
}

function labelForSourceName(name) {
  return name
    .replace(/^alsa_input\./, '')
    .replace(/\.analog-stereo$/, '')
    .replace(/\.input$/, '')
    .replace(/_/g, ' ');
}
