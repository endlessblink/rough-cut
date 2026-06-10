// Editor v2 media pool — the approved mockup's grammar: bin rail on the
// left, search + view toggle in the head, thumbnail grid (or list) of the
// project's media. Bins are real filters over asset types that actually
// exist in the project; the Generated bin reuses the existing AI panel.
import React from 'react';
import { FilmStrip, Image as ImageIcon, ListBullets, MagnifyingGlass, SpeakerSimpleHigh, SquaresFour, VideoCamera } from '@phosphor-icons/react';
import { GeneratedAssetsPanel } from '../nle/asset-panel';
import { assetLabel, formatDuration } from '../nle/asset-format.mjs';
import type { NleAsset, NleProject } from '../nle/types';

type BinId = 'all' | 'video' | 'audio' | 'stills' | 'generated';

function assetBin(asset: NleAsset): Exclude<BinId, 'all' | 'generated'> | null {
  const type = String(asset.type ?? '').toLowerCase();
  if (type.includes('audio')) return 'audio';
  if (type.includes('image') || type.includes('still')) return 'stills';
  return 'video';
}

function assetThumbIcon(bin: ReturnType<typeof assetBin>, isCamera: boolean) {
  if (bin === 'audio') return <SpeakerSimpleHigh aria-hidden="true" />;
  if (bin === 'stills') return <ImageIcon aria-hidden="true" />;
  if (isCamera) return <VideoCamera aria-hidden="true" />;
  return <FilmStrip aria-hidden="true" />;
}

export function MediaPool({ project }: { project: NleProject }) {
  const [bin, setBin] = React.useState<BinId>('all');
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const assets = (project.document.assets ?? []) as ReadonlyArray<NleAsset>;

  const bins = React.useMemo(() => {
    const present = new Set(assets.map((asset) => assetBin(asset)));
    const list: Array<{ id: BinId; label: string }> = [{ id: 'all', label: 'All media' }];
    if (present.has('video')) list.push({ id: 'video', label: 'Video' });
    if (present.has('audio')) list.push({ id: 'audio', label: 'Audio' });
    if (present.has('stills')) list.push({ id: 'stills', label: 'Stills' });
    list.push({ id: 'generated', label: 'Generated' });
    return list;
  }, [assets]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets
      .map((asset, index) => ({ asset, index }))
      .filter(({ asset }) => (bin === 'all' || bin === 'generated' ? true : assetBin(asset) === bin))
      .filter(({ asset, index }) => !needle || assetLabel(asset, index).toLowerCase().includes(needle));
  }, [assets, bin, query]);

  return (
    <div className="ev2MediaPool" data-ui-region="ev2-media-pool">
      <div className="ev2MediaHead">
        <label className="ev2MediaSearch">
          <MagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search media"
            aria-label="Search media"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          className="ev2MediaViewBtn"
          aria-pressed={view === 'grid'}
          aria-label="Grid view"
          title="Grid view"
          onClick={() => setView('grid')}
        >
          <SquaresFour aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ev2MediaViewBtn"
          aria-pressed={view === 'list'}
          aria-label="List view"
          title="List view"
          onClick={() => setView('list')}
        >
          <ListBullets aria-hidden="true" />
        </button>
      </div>
      <div className="ev2MediaBody">
        <nav className="ev2MediaBins" aria-label="Media bins">
          {bins.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ev2MediaBin"
              aria-pressed={bin === item.id}
              onClick={() => setBin(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ev2MediaContent">
          {bin === 'generated' ? (
            <GeneratedAssetsPanel />
          ) : filtered.length === 0 ? (
            <div className="ev2MediaEmpty">
              <p>{query ? 'No media matches the search.' : 'No media in this project yet.'}</p>
              <p>{query ? 'Clear the search to see everything.' : 'Record a take or import a file.'}</p>
            </div>
          ) : (
            <ul className={`ev2MediaItems ${view}`}>
              {filtered.map(({ asset, index }) => (
                <MediaItem key={asset.id ?? index} asset={asset} index={index} project={project} view={view} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaItem({ asset, index, project, view }: { asset: NleAsset; index: number; project: NleProject; view: 'grid' | 'list' }) {
  const bin = assetBin(asset);
  const isCamera = Boolean((asset as Record<string, unknown>).metadata && (asset as { metadata?: { isCamera?: boolean } }).metadata?.isCamera);
  const duration = formatDuration(asset.duration);
  // The primary recording's media is servable through project.mediaUrl;
  // camera media through cameraMediaUrl. Other assets fall back to the
  // kind glyph until per-asset thumbnails exist.
  const previewUrl = typeof asset.thumbnailUrl === 'string' && asset.thumbnailUrl
    ? asset.thumbnailUrl
    : isCamera
      ? project.cameraMediaUrl ?? null
      : bin === 'video' && index === 0
        ? project.mediaUrl ?? null
        : null;

  return (
    <li className="ev2MediaItem" data-asset-type={asset.type ?? 'unknown'} title={assetLabel(asset, index)}>
      <span className={`ev2MediaThumb ${bin ?? 'video'}`}>
        {previewUrl ? (
          <video className="ev2MediaThumbVideo" src={previewUrl} muted preload="metadata" aria-hidden="true" />
        ) : (
          assetThumbIcon(bin, isCamera)
        )}
        {duration ? <span className="ev2MediaLen">{duration}</span> : null}
      </span>
      <span className="ev2MediaMeta">
        <span className="ev2MediaName">{assetLabel(asset, index)}</span>
        {view === 'list' && duration ? <span className="ev2MediaSub">{duration}</span> : null}
      </span>
    </li>
  );
}
