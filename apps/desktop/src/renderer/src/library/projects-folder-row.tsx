import * as React from 'react';
import { FolderOpen as PhosphorFolderOpen } from '@phosphor-icons/react';

type ProjectsDirInfo = { current: string; saved: string; isDefault: boolean; defaultDir: string; restartRequired: boolean };

/** `/home/me/Documents/Rough Cut MVP/recordings` -> `…/Documents/Rough Cut MVP/recordings` (full path stays in the tooltip). */
function shortenPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : path;
}

/**
 * Where projects live. Quiet by design: one line under the Projects header, with
 * the folder, a Change action, and (only after a change) the restart it needs.
 */
export function ProjectsFolderRow() {
  const [info, setInfo] = React.useState<ProjectsDirInfo | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    window.roughCut.getProjectsDir().then((value) => { if (alive) setInfo(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!info) return null;

  const run = async (action: () => Promise<ProjectsDirInfo>) => {
    setBusy(true);
    try { setInfo(await action()); } finally { setBusy(false); }
  };

  return (
    <div className="libraryFolderRow" data-ui-region="projects-folder">
      <PhosphorFolderOpen size={15} weight="regular" aria-hidden />
      <span className="libraryFolderLabel">Projects folder</span>
      <span className="libraryFolderPath" title={info.current}>{shortenPath(info.current)}</span>
      <button type="button" className="libraryFolderAction" disabled={busy} onClick={() => run(() => window.roughCut.chooseProjectsDir())}>Change…</button>
      {!info.isDefault ? (
        <button type="button" className="libraryFolderAction" disabled={busy} onClick={() => run(() => window.roughCut.resetProjectsDir())}>Use default</button>
      ) : null}
      {info.restartRequired ? (
        <>
          <span className="libraryFolderPending" role="status" title={info.saved}>
            Next start: {shortenPath(info.saved)}. Projects in the old folder stay where they are.
          </span>
          <button type="button" className="libraryFolderAction isPrimary" disabled={busy} onClick={() => { void window.roughCut.relaunchApp(); }}>Restart to switch</button>
        </>
      ) : null}
    </div>
  );
}
