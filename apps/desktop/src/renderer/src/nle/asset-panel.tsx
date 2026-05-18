import React from 'react';
import type { NleProject } from './types';
import { assetLabel, formatDuration } from './asset-format.mjs';

type AssetTabId = 'project' | 'generated';

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
          <div className="nleAssetEmpty">
            <p>AI-generated assets land here.</p>
            <p className="nleAssetEmptyHint">Wire-up in Phase 3.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
