import React from 'react';
import type { NleProject } from './types';
import { assetLabel, formatDuration } from './asset-format.mjs';

type AssetTabId = 'project' | 'generated';
type GeneratedAssetKind = 'audio' | 'image' | 'video' | 'motion-graphics';
type GeneratedFilter = 'all' | GeneratedAssetKind;
type GeneratedAsset = {
  id: string;
  kind: GeneratedAssetKind;
  providerId: string;
  sourcePrompt: string;
  createdAt: string;
  tags: string[];
  sessionId: string;
  filePath: string;
};
type RoughCutAiBridge = {
  listAiAssets?: () => Promise<GeneratedAsset[]>;
  resolveAiAsset?: (payload: { id: string }) => Promise<GeneratedAsset | null>;
  tagAiAsset?: (payload: { id: string; tags: string[] }) => Promise<GeneratedAsset>;
  deleteAiAsset?: (payload: { id: string }) => Promise<{ removed: boolean; blocked?: boolean; reason?: string }>;
};

const TABS: ReadonlyArray<{ id: AssetTabId; label: string }> = [
  { id: 'project', label: 'Project assets' },
  { id: 'generated', label: 'Generated' },
];

export function AssetPanel({ project }: { project: NleProject | null }) {
  const [activeTab, setActiveTab] = React.useState<AssetTabId>('project');
  const assets = project?.document?.assets ?? [];

  return (
    <aside className="nleAssetPanel" data-ui-region="nle-asset-panel" aria-label="Assets">
      <div className="nleAssetPanelTabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={`nleAssetPanelTab ${tab.id === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="nleAssetPanelBody" role="tabpanel">
        {activeTab === 'project' ? (
          assets.length === 0 ? (
            <div className="nleAssetEmpty">
              <p>No assets in this project yet.</p>
              <p className="nleAssetEmptyHint">Record a take or import a file.</p>
            </div>
          ) : (
            <ul className="nleAssetList">
              {assets.map((asset, index) => {
                const duration = formatDuration(asset.duration);
                return (
                  <li key={asset.id ?? index} className="nleAssetItem" data-asset-type={asset.type ?? 'unknown'}>
                    <div className="nleAssetThumb" aria-hidden="true" />
                    <div className="nleAssetMeta">
                      <span className="nleAssetLabel">{assetLabel(asset, index)}</span>
                      {duration ? <span className="nleAssetDuration">{duration}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <GeneratedAssetsPanel />
        )}
      </div>
    </aside>
  );
}

export function GeneratedAssetsPanel() {
  const [assets, setAssets] = React.useState<GeneratedAsset[]>([]);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<GeneratedFilter>('all');
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');

  React.useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const bridge = (window as Window & { roughCut?: RoughCutAiBridge }).roughCut;
    bridge?.listAiAssets?.()
      .then((items) => {
        if (cancelled) return;
        setAssets(Array.isArray(items) ? items : []);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  const filteredAssets = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.kind !== filter) return false;
      if (!needle) return true;
      return [asset.sourcePrompt, asset.providerId, asset.sessionId, asset.kind, ...asset.tags]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [assets, filter, query]);

  if (status === 'loading') {
    return (
      <div className="nleGeneratedStack" data-ui-region="nle-generated-assets">
        <GeneratedControls query={query} filter={filter} onQueryChange={setQuery} onFilterChange={setFilter} />
        <div className="nleGeneratedSkeleton" aria-label="Loading generated assets">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="nleGeneratedStack" data-ui-region="nle-generated-assets">
        <GeneratedControls query={query} filter={filter} onQueryChange={setQuery} onFilterChange={setFilter} />
        <div className="nleAssetEmpty" role="status">
          <p>Generated assets are unavailable.</p>
          <p className="nleAssetEmptyHint">The store could not be read.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nleGeneratedStack" data-ui-region="nle-generated-assets">
      <GeneratedControls query={query} filter={filter} onQueryChange={setQuery} onFilterChange={setFilter} />
      {assets.length === 0 ? (
        <div className="nleAssetEmpty">
          <p>No generated assets yet.</p>
          <p className="nleAssetEmptyHint">Narration, images, and motion exports will appear here.</p>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="nleAssetEmpty">
          <p>No matching assets.</p>
          <p className="nleAssetEmptyHint">Clear search or change the type filter.</p>
        </div>
      ) : (
        <ul className="nleAssetList generated">
          {filteredAssets.map((asset) => <GeneratedAssetItem key={asset.id} asset={asset} />)}
        </ul>
      )}
    </div>
  );
}

function GeneratedControls({
  query,
  filter,
  onQueryChange,
  onFilterChange,
}: {
  query: string;
  filter: GeneratedFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: GeneratedFilter) => void;
}) {
  const filters: ReadonlyArray<{ id: GeneratedFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'audio', label: 'Audio' },
    { id: 'image', label: 'Image' },
    { id: 'video', label: 'Video' },
    { id: 'motion-graphics', label: 'MG' },
  ];
  return (
    <div className="nleGeneratedControls">
      <label className="nleGeneratedSearch">
        <span className="srOnly">Search generated assets</span>
        <input
          type="search"
          value={query}
          placeholder="Search prompt, tag, provider"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <div className="nleGeneratedFilters" aria-label="Generated asset type filter">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => onFilterChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GeneratedAssetItem({ asset }: { asset: GeneratedAsset }) {
  const createdAt = new Date(asset.createdAt);
  const dateLabel = Number.isNaN(createdAt.getTime()) ? null : createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function startDrag(event: React.DragEvent<HTMLLIElement>) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-rough-cut-ai-asset', JSON.stringify(asset));
    event.dataTransfer.setData('text/plain', asset.id);
  }
  return (
    <li className="nleAssetItem generated" data-asset-kind={asset.kind} draggable onDragStart={startDrag} title="Drag to a compatible timeline track">
      <GeneratedPreview asset={asset} />
      <div className="nleAssetMeta">
        <span className="nleAssetLabel">{asset.sourcePrompt || asset.filePath.split(/[\\/]/).pop() || asset.id}</span>
        <span className="nleAssetDuration">{kindLabel(asset.kind)} · {asset.providerId}{dateLabel ? ` · ${dateLabel}` : ''}</span>
        {asset.tags.length > 0 ? (
          <span className="nleGeneratedTags">{asset.tags.slice(0, 3).join(', ')}</span>
        ) : null}
      </div>
    </li>
  );
}

function GeneratedPreview({ asset }: { asset: GeneratedAsset }) {
  if (asset.kind === 'image') {
    return <img className="nleAssetThumb generated" src={asset.filePath} alt="" loading="lazy" />;
  }
  if (asset.kind === 'video') {
    return <video className="nleAssetThumb generated" src={asset.filePath} muted preload="metadata" aria-label="Video preview" />;
  }
  if (asset.kind === 'audio') {
    return (
      <div className="nleAssetThumb generated audio" aria-label="Audio preview">
        <span /><span /><span /><span />
      </div>
    );
  }
  return (
    <div className="nleAssetThumb generated motion" aria-label="Motion graphics preview">
      <span>MG</span>
    </div>
  );
}

function kindLabel(kind: GeneratedAssetKind) {
  if (kind === 'motion-graphics') return 'Motion';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}
