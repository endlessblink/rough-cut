import * as React from 'react';
import { FolderOpen as PhosphorFolderOpen } from '@phosphor-icons/react';
import { shortenPath } from './path-label';

type ExportsDirInfo = { current: string; isDefault: boolean; defaultDir: string };

/**
 * Where the export will be saved, visible and changeable BEFORE exporting: pick the folder in the desktop's
 * own file dialog (KDE's on KDE), or open it in the file manager to see what is already there.
 */
export function ExportDestination({ disabled = false }: { disabled?: boolean }) {
  const [info, setInfo] = React.useState<ExportsDirInfo | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    window.roughCut.getExportsDir().then((value) => { if (alive) setInfo(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  if (!info) return null;

  const run = async (action: () => Promise<ExportsDirInfo>) => {
    setBusy(true);
    try { setInfo(await action()); } finally { setBusy(false); }
  };

  return (
    <div className="exportDestination" data-ui-region="export-destination">
      <span>Save to</span>
      <span className="exportDestinationPath" title={info.current}>{shortenPath(info.current)}</span>
      <div className="exportDestinationActions">
        <button type="button" data-export-action="choose-folder" disabled={disabled || busy} onClick={() => run(() => window.roughCut.chooseExportsDir())}>
          <PhosphorFolderOpen size={15} weight="regular" aria-hidden /> Choose…
        </button>
        <button type="button" data-export-action="open-exports-folder" disabled={busy} onClick={() => { void window.roughCut.openPath(info.current); }}>
          Open folder
        </button>
        {!info.isDefault ? (
          <button type="button" disabled={disabled || busy} onClick={() => run(() => window.roughCut.resetExportsDir())}>Use default</button>
        ) : null}
      </div>
    </div>
  );
}
