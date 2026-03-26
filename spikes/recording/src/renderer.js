/**
 * Renderer-side logic for the recording spike.
 * Communicates with main via spikeAPI (preload).
 */

const log = document.getElementById('log');
const platform = document.getElementById('platform');
const electronVersion = document.getElementById('electron-version');

platform.textContent = navigator.platform;
electronVersion.textContent = navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || 'unknown';

function appendLog(msg) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  log.textContent += line + '\n';
  log.scrollTop = log.scrollHeight;
  console.log(line);
}

let selectedSourceId = null;
let mediaRecorder = null;
let recordedChunks = [];

// 1. Source enumeration
document.getElementById('btn-sources').addEventListener('click', async () => {
  appendLog('Enumerating sources...');
  try {
    const sources = await window.spikeAPI.getSources();
    appendLog(`Found ${sources.length} sources`);
    const container = document.getElementById('sources');
    container.innerHTML = '';
    sources.forEach(s => {
      const card = document.createElement('div');
      card.className = 'source-card';
      card.innerHTML = `<img src="${s.thumbnail}"><div>${s.name}</div><div style="font-size:10px;color:#888">${s.id}</div>`;
      card.addEventListener('click', () => {
        document.querySelectorAll('.source-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedSourceId = s.id;
        appendLog(`Selected source: ${s.name} (${s.id})`);
      });
      container.appendChild(card);
    });
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
  }
});

// 2. Screen capture
async function captureScreen(fps, durationSeconds) {
  if (!selectedSourceId) {
    appendLog('ERROR: Select a source first');
    return;
  }
  appendLog(`Starting screen capture at ${fps}fps for ${durationSeconds}s...`);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
          maxFrameRate: fps,
          minFrameRate: fps,
        },
      },
    });
    const preview = document.getElementById('preview');
    preview.srcObject = stream;

    // Count actual frames delivered
    let frameCount = 0;
    const track = stream.getVideoTracks()[0];
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    const startTime = performance.now();

    const countFrames = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        frameCount++;
        value.close();
        if (performance.now() - startTime > durationSeconds * 1000) break;
      }
    };

    await countFrames();
    const elapsed = (performance.now() - startTime) / 1000;
    const actualFps = frameCount / elapsed;
    appendLog(`Captured ${frameCount} frames in ${elapsed.toFixed(2)}s = ${actualFps.toFixed(1)}fps (requested ${fps}fps)`);
    appendLog(`Settings: ${JSON.stringify(track.getSettings())}`);

    stream.getTracks().forEach(t => t.stop());
    preview.srcObject = null;
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
  }
}

document.getElementById('btn-screen-30').addEventListener('click', () => captureScreen(30, 5));
document.getElementById('btn-screen-60').addEventListener('click', () => captureScreen(60, 5));

// 3. Webcam
document.getElementById('btn-webcam').addEventListener('click', async () => {
  appendLog('Opening webcam...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    document.getElementById('webcam-preview').srcObject = stream;
    const settings = stream.getVideoTracks()[0].getSettings();
    appendLog(`Webcam open: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);
    setTimeout(() => { stream.getTracks().forEach(t => t.stop()); appendLog('Webcam closed'); }, 5000);
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
  }
});

// 4. Microphone
document.getElementById('btn-mic').addEventListener('click', async () => {
  appendLog('Testing microphone...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const settings = stream.getAudioTracks()[0].getSettings();
    appendLog(`Mic open: sampleRate=${settings.sampleRate}, channels=${settings.channelCount}`);
    document.getElementById('mic-status').textContent = 'OK';
    document.getElementById('mic-status').className = 'status pass';
    setTimeout(() => { stream.getTracks().forEach(t => t.stop()); appendLog('Mic closed'); }, 3000);
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
    document.getElementById('mic-status').textContent = 'FAIL';
    document.getElementById('mic-status').className = 'status fail';
  }
});

// 5. System audio
document.getElementById('btn-sysaudio').addEventListener('click', async () => {
  appendLog('Testing system audio capture...');
  if (!selectedSourceId) {
    appendLog('ERROR: Select a screen source first');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
        },
      },
    });
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      appendLog(`System audio available: ${audioTracks.length} track(s)`);
      appendLog(`Settings: ${JSON.stringify(audioTracks[0].getSettings())}`);
      document.getElementById('sysaudio-status').textContent = 'OK';
      document.getElementById('sysaudio-status').className = 'status pass';
    } else {
      appendLog('No audio tracks in system capture stream');
      document.getElementById('sysaudio-status').textContent = 'NO TRACKS';
      document.getElementById('sysaudio-status').className = 'status fail';
    }
    setTimeout(() => stream.getTracks().forEach(t => t.stop()), 2000);
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
    document.getElementById('sysaudio-status').textContent = 'FAIL';
    document.getElementById('sysaudio-status').className = 'status fail';
  }
});

// 6. Full recording
document.getElementById('btn-record').addEventListener('click', async () => {
  if (!selectedSourceId) {
    appendLog('ERROR: Select a source first');
    return;
  }
  appendLog('Starting 30s recording...');
  document.getElementById('btn-record').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  recordedChunks = [];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSourceId,
          maxFrameRate: 30,
        },
      },
    });

    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      appendLog(`Recording stopped. ${recordedChunks.length} chunks collected.`);
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      appendLog(`File size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      const buffer = await blob.arrayBuffer();
      const filename = `recording-${navigator.platform}-${Date.now()}.webm`;
      const filePath = await window.spikeAPI.saveRecording({ buffer: new Uint8Array(buffer), filename });
      appendLog(`Saved to: ${filePath}`);

      stream.getTracks().forEach(t => t.stop());
      document.getElementById('btn-record').disabled = false;
      document.getElementById('btn-stop').disabled = true;
      document.getElementById('record-status').textContent = 'Saved';
      document.getElementById('record-status').className = 'status pass';
    };

    mediaRecorder.start(1000); // 1s chunks
    appendLog('MediaRecorder started (1s chunks)');

    // Auto-stop after 30s
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        appendLog('Auto-stopping after 30s');
        mediaRecorder.stop();
      }
    }, 30000);
  } catch (err) {
    appendLog(`ERROR: ${err.message}`);
    document.getElementById('btn-record').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  }
});

document.getElementById('btn-stop').addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
});
