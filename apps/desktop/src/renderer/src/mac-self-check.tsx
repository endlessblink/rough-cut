import { useEffect, useRef, useState } from 'react';
import './mac-self-check.css';

type CheckId = 'opens' | 'screen' | 'mic' | 'camera' | 'claude' | 'transcription';
export type SelfCheckResult = { id: CheckId; status: 'pass' | 'fail' | 'skipped'; detail: string };
type CheckRow = { id: CheckId; label: string; status: 'pending' | 'running' | SelfCheckResult['status']; detail: string };
type SupportStatus = { platform: string; appVersion: string; claude?: { ok?: boolean; status?: string }; transcription?: { available?: boolean; engine?: string }; selfCheck?: SelfCheckResult[] | null };
type SupportReport = { zipPath: string; fileNames: string[]; issueUrl: string; issueOpened?: boolean };
type SupportApi = {
  supportStatus: () => Promise<SupportStatus>;
  supportScreenThumbnail: () => Promise<{ dataUrl: string }>;
  saveSelfCheck: (results: SelfCheckResult[]) => Promise<unknown>;
  supportCreateReport: () => Promise<SupportReport>;
  reportProblem: () => Promise<SupportReport>;
};
const initialRows = (): CheckRow[] => [
  { id: 'opens', label: 'App opens', status: 'pending', detail: 'Ready to check' },
  { id: 'screen', label: 'Screen capture', status: 'pending', detail: 'A real screen thumbnail will appear below' },
  { id: 'mic', label: 'Microphone', status: 'pending', detail: 'Speak for a few seconds when asked' },
  { id: 'camera', label: 'Camera', status: 'pending', detail: 'A live preview will open briefly' },
  { id: 'claude', label: 'Claude connection', status: 'pending', detail: 'Checks the existing connection' },
  { id: 'transcription', label: 'Transcription', status: 'pending', detail: 'Checks the installed engine' },
];

function bounded<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function failureMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) return 'Permission was not granted. Allow access in system settings, then run again.';
  if (error instanceof DOMException && ['NotFoundError', 'DevicesNotFoundError'].includes(error.name)) return 'No device was found. Connect one, then run again.';
  if (error instanceof Error && /timed out|No microphone|Camera did not|Screen thumbnail/.test(error.message)) return error.message;
  return fallback;
}

export function MacSelfCheck({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const cleanups = useRef(new Set<() => void>());
  const [rows, setRows] = useState(initialRows);
  const [running, setRunning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [unsavedResults, setUnsavedResults] = useState(false);
  const [screenImage, setScreenImage] = useState<string | null>(null);
  const [cameraLive, setCameraLive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');
  const [report, setReport] = useState<{ zipPath: string; fileNames: string[] } | null>(null);
  const api = () => (window.roughCut as unknown as SupportApi);
  const cleanup = () => { for (const release of cleanups.current) release(); cleanups.current.clear(); };

  useEffect(() => {
    dialog.current?.showModal();
    const current = generation.current;
    void api().supportStatus().then(status => {
      if (generation.current !== current) return;
      setVersion(status.appVersion);
      const savedResults = status.selfCheck;
      if (Array.isArray(savedResults) && savedResults.length) {
        setRows(previous => previous.map(row => {
          const saved = savedResults.find(result => result.id === row.id);
          return saved && ['pass', 'fail', 'skipped'].includes(saved.status) ? { ...row, status: saved.status, detail: saved.detail } : row;
        }));
        setNotice('Showing your saved results. Run again to check the current setup.');
      }
    }).catch(() => {});
    return () => { generation.current += 1; cleanup(); };
  }, []);

  function close() {
    generation.current += 1;
    cleanup();
    dialog.current?.close();
    onClose();
  }

  async function run(setupOnly = false) {
    if (running) return;
    const current = ++generation.current;
    const active = () => generation.current === current;
    const results: SelfCheckResult[] = [];
    cleanup();
    setRunning(true);
    setUnsavedResults(true);
    setRows(initialRows());
    setScreenImage(null);
    setReport(null);
    setError('');
    setNotice(setupOnly ? 'Checking app setup only. Screen, microphone and camera will be marked as skipped.' : 'Allow the system permission prompts. You can close this check at any time.');
    const update = (id: CheckId, status: CheckRow['status'], detail: string) => {
      if (active()) setRows(previous => previous.map(row => row.id === id ? { ...row, status, detail } : row));
    };
    const check = async (id: CheckId, pending: string, action: () => Promise<string>, fallback: string) => {
      if (!active()) return;
      if (setupOnly && ['screen', 'mic', 'camera'].includes(id)) {
        const detail = 'Skipped in setup-only check. Run the full self-check to test this device.';
        results.push({ id, status: 'skipped', detail });
        update(id, 'skipped', detail);
        return;
      }
      update(id, 'running', pending);
      try {
        const detail = await action();
        if (!active()) return;
        results.push({ id, status: 'pass', detail });
        update(id, 'pass', detail);
      } catch (cause) {
        if (!active()) return;
        const detail = failureMessage(cause, fallback);
        results.push({ id, status: 'fail', detail });
        update(id, 'fail', detail);
      }
    };
    const media = async (constraints: MediaStreamConstraints) => {
      let expired = false;
      const requested = navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        if (!active() || expired) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error('Device access timed out. Run again after allowing access.');
        }
        return stream;
      });
      try {
        const stream = await bounded(requested, 15000, 'Device access timed out. Run again after allowing access.');
        const stop = () => stream.getTracks().forEach(track => track.stop());
        cleanups.current.add(stop);
        return { stream, stop: () => { stop(); cleanups.current.delete(stop); } };
      } catch (cause) { expired = true; throw cause; }
    };

    try {
      await check('opens', 'Checking the app…', async () => 'The app and this check screen opened.', 'The app could not be checked.');
      await check('screen', 'Capturing a screen thumbnail…', async () => {
        const { dataUrl } = await bounded(api().supportScreenThumbnail(), 15000, 'Screen thumbnail timed out. Allow Screen Recording in system settings, then run again.');
        if (!dataUrl?.startsWith('data:image/')) throw new Error('Screen thumbnail was not available. Allow Screen Recording in system settings, then run again.');
        const image = new Image();
        image.src = dataUrl;
        await bounded(image.decode(), 5000, 'Screen thumbnail timed out. Run again.');
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('Screen thumbnail was empty. Run again.');
        if (active()) setScreenImage(dataUrl);
        return 'A real screen thumbnail was captured.';
      }, 'Screen capture failed. Allow Screen Recording in system settings, then run again.');
      await check('mic', 'Speak now — listening for a moving microphone level…', async () => {
        const { stream, stop } = await media({ audio: true, video: false });
        let context: AudioContext | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let frame = 0;
        let released = false;
        const dispose = () => {
          if (released) return;
          released = true;
          cancelAnimationFrame(frame);
          stop();
          try { source?.disconnect(); } catch { /* A partially initialized graph may already be disconnected. */ }
          try { if (context && context.state !== 'closed') void context.close().catch(() => {}); } catch { /* Tracks are already stopped. */ }
        };
        cleanups.current.add(dispose);
        try {
          context = new AudioContext();
          source = context.createMediaStreamSource(stream);
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          await bounded(context.resume(), 3000, 'Microphone check timed out. Run again.');
          const samples = new Float32Array(analyser.fftSize);
          let peak = 0;
          let lowest = Infinity;
          let lastPaint = 0;
          await new Promise<void>(resolve => {
            const started = performance.now();
            const sample = (now: number) => {
              if (!active() || now - started >= 4500) { resolve(); return; }
              analyser.getFloatTimeDomainData(samples);
              const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
              peak = Math.max(peak, rms);
              lowest = Math.min(lowest, rms);
              if (now - lastPaint > 80) { setMicLevel(Math.min(1, rms * 8)); lastPaint = now; }
              frame = requestAnimationFrame(sample);
            };
            frame = requestAnimationFrame(sample);
            // A backgrounded window may stop painting; never leave a device open indefinitely.
            const timer = setTimeout(resolve, 5000);
            cleanups.current.add(() => { clearTimeout(timer); resolve(); });
          });
          if (peak < 0.003 || peak - lowest < 0.001) throw new Error('No microphone level movement was detected. Check the input and speak, then run again.');
          return 'The microphone level moved while listening.';
        } finally { dispose(); cleanups.current.delete(dispose); if (active()) setMicLevel(0); }
      }, 'The microphone could not be opened. Check its permission and selected input.');
      await check('camera', 'Opening a live camera preview…', async () => {
        const { stream, stop } = await media({ audio: false, video: true });
        const element = video.current;
        if (!element) { stop(); throw new Error('Camera did not open. Run again.'); }
        const dispose = () => { stop(); element.srcObject = null; };
        cleanups.current.add(dispose);
        try {
          element.srcObject = stream;
          await bounded(element.play(), 8000, 'Camera did not open in time. Check its permission, then run again.');
          await bounded(new Promise<void>(resolve => {
            if (element.videoWidth > 0 && element.readyState >= 2) resolve();
            else element.addEventListener('loadeddata', () => resolve(), { once: true });
          }), 8000, 'Camera did not produce a preview. Check its permission, then run again.');
          if (!element.videoWidth || !element.videoHeight) throw new Error('Camera did not produce a preview. Run again.');
          if (active()) setCameraLive(true);
          await new Promise(resolve => setTimeout(resolve, 1800));
          return 'The live camera preview opened.';
        } finally { dispose(); cleanups.current.delete(dispose); if (active()) setCameraLive(false); }
      }, 'The camera could not be opened. Check its permission and connection.');
      let status: SupportStatus | null = null;
      await check('claude', 'Checking the Claude connection…', async () => {
        status = await bounded(api().supportStatus(), 15000, 'Connection check timed out. Run again.');
        if (active()) setVersion(status.appVersion);
        if (!status.claude?.ok) throw new Error('Claude is not connected.');
        return 'Claude is connected.';
      }, 'Claude is not connected. Open Claude setup, then run again.');
      await check('transcription', 'Checking the transcription engine…', async () => {
        if (!status) status = await bounded(api().supportStatus(), 15000, 'Transcription check timed out. Run again.');
        if (!status.transcription?.available) throw new Error('Transcription is not available.');
        return status.transcription.engine ? `Transcription is available (${status.transcription.engine}).` : 'Transcription is available.';
      }, 'No transcription engine is available. Check transcription settings, then run again.');
      if (!active()) return;
      await bounded(api().saveSelfCheck(results), 10000, 'Saving the check timed out. Run again before making a report.');
      if (active()) { setUnsavedResults(false); setNotice('Check finished. These results will be included in your problem report.'); }
    } catch {
      if (active()) setError('The results could not be saved. Run the check again before making a report.');
    } finally {
      cleanup();
      if (active()) { setRunning(false); setCameraLive(false); setMicLevel(0); }
    }
  }

  async function createReport(openIssue = true) {
    if (reporting || running || unsavedResults) return;
    const current = generation.current;
    setReporting(true);
    setError('');
    try {
      const result = await bounded(openIssue ? api().reportProblem() : api().supportCreateReport(), 30000, 'Report creation timed out.');
      if (generation.current !== current) return;
      setReport(result);
      setNotice(openIssue
        ? result.issueOpened === false
          ? 'The zip is saved on your Desktop; the browser could not open. Open Help > Report a problem again or share the zip manually. Nothing was sent.'
          : 'The zip is on your Desktop. Attach it to the GitHub issue that opened, then submit when ready.'
        : 'The zip is on your Desktop. Review its contents before sharing. Nothing has been sent.');
    } catch {
      if (generation.current === current) setError('The report could not be created or the issue page could not be opened. Try Report a problem again.');
    } finally { if (generation.current === current) setReporting(false); }
  }

  return <dialog ref={dialog} className="macSelfCheck" aria-labelledby="mac-self-check-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="macSelfCheckHeader">
      <div><h2 id="mac-self-check-title">Mac self-check</h2><p>Check recording access and connected tools.{version ? ` Rough Cut ${version}.` : ''}</p></div>
      <button type="button" className="secondary compact" onClick={close} aria-label="Close Mac self-check">Close</button>
    </header>
    <p className="macSelfCheckIntro">Run once before your first recording. The check briefly uses your screen, microphone and camera; no recording is saved.</p>
    <ol className="macSelfCheckRows" aria-label="Self-check results">
      {rows.map(row => <li key={row.id} data-check={row.id} data-status={row.status}>
        <div><strong>{row.label}</strong><span>{row.detail}</span>{row.id === 'mic' ? <meter min={0} max={1} value={micLevel} aria-label="Microphone input level" /> : null}</div>
        <span className="macSelfCheckStatus">{row.status === 'pass' ? 'Pass' : row.status === 'fail' ? 'Fail' : row.status === 'skipped' ? 'Skipped' : row.status === 'running' ? 'Checking…' : 'Not checked'}</span>
      </li>)}
    </ol>
    <div className="macSelfCheckPreviews">
      <figure><figcaption>Screen thumbnail · stays on this device</figcaption><div>{screenImage ? <img src={screenImage} alt="Screen captured during this self-check" /> : <span>Screen thumbnail appears here</span>}</div></figure>
      <figure><figcaption>Camera preview · not saved</figcaption><div><video ref={video} muted playsInline aria-label="Self-check live camera preview" hidden={!cameraLive} />{!cameraLive ? <span>Live preview appears during the camera check</span> : null}</div></figure>
    </div>
    <p className="macSelfCheckNotice" role="status">{notice || 'Nothing is sent automatically. Reports contain check results, device details and a redacted log; no screen or camera images.'}</p>
    {error ? <p className="macSelfCheckError" role="alert">{error}</p> : null}
    {report ? <section className="macSelfCheckReport" aria-label="Problem report contents"><strong>Saved to Desktop</strong><span>{report.zipPath.split(/[\\/]/).pop()}</span><ul>{report.fileNames.map(name => <li key={name}>{name}</li>)}</ul><p>Nothing is sent automatically. Review the zip, attach it to the issue, then submit when ready.</p></section> : null}
    <footer className="macSelfCheckActions"><button type="button" onClick={() => void run()} disabled={running || reporting}>{running ? 'Checking…' : rows.some(row => row.status !== 'pending') ? 'Run again' : 'Run self-check'}</button><button type="button" className="secondary" onClick={() => void run(true)} disabled={running || reporting}>Check app setup only</button><button type="button" className="secondary" onClick={() => void createReport(false)} disabled={running || reporting || unsavedResults}>Save report zip</button><button type="button" className="secondary" onClick={() => void createReport()} disabled={running || reporting || unsavedResults}>{reporting ? 'Creating report…' : 'Report a problem'}</button></footer>
  </dialog>;
}
