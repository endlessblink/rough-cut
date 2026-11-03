// Where faster-whisper runs. CUDA (an Nvidia card) by default; a Mac has no CUDA and CTranslate2 has no Metal
// backend, so it runs on the CPU with int8 weights there: slower, but it works on every Mac. The two
// ROUGH_CUT_FASTER_WHISPER_* variables still win everywhere.
export function fasterWhisperDevice({ env = process.env, platform = process.platform } = {}) {
  const mac = platform === 'darwin';
  return {
    device: env.ROUGH_CUT_FASTER_WHISPER_DEVICE || (mac ? 'cpu' : 'cuda'),
    computeType: env.ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE || (mac ? 'int8' : 'int8_float16'),
  };
}
