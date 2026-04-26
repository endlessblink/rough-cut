import { useState, useEffect } from 'react';
import {
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  BG_CARD,
  BG_CONTROL,
  BG_CONTROL_HOVER,
  BORDER_SUBTLE,
  BORDER_LIGHT,
  ACCENT_COLOR,
} from '../../ui/tokens.js';

interface MountedVolume {
  path: string;
  name: string;
}

// Derive a compact display path — show the last 3 segments.
// Combined with the RTL direction trick, this naturally shows the tail.
function displayPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 3) return p;
  return '…/' + parts.slice(-3).join('/');
}

// ---- Volume chip ----

interface VolumeChipProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function VolumeChip({ label, isActive, onClick }: VolumeChipProps) {
  const [hovered, setHovered] = useState(false);

  const bg = isActive
    ? ACCENT_COLOR + '1a'
    : hovered
    ? BG_CONTROL_HOVER
    : BG_CONTROL;

  const border = isActive
    ? `1px solid ${ACCENT_COLOR}40`
    : hovered
    ? `1px solid ${BORDER_LIGHT}`
    : `1px solid ${BORDER_SUBTLE}`;

  const color = isActive ? TEXT_PRIMARY : TEXT_SECONDARY;

  return (
    <button
      data-testid="storage-volume-chip"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 30,
        padding: '0 12px',
        borderRadius: 8,
        background: bg,
        border,
        color,
        fontSize: 12,
        fontFamily: 'inherit',
        fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        transition: 'background 100ms ease, border-color 100ms ease, color 100ms ease',
        whiteSpace: 'nowrap',
        maxWidth: 180,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>💾</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ---- Favorite chip ----

interface FavoriteChipProps {
  path: string;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}

function FavoriteChip({ path, isActive, onClick, onRemove }: FavoriteChipProps) {
  const [hovered, setHovered] = useState(false);
  const [removeHovered, setRemoveHovered] = useState(false);

  const label = displayPath(path);

  const bg = isActive
    ? ACCENT_COLOR + '1a'
    : hovered
    ? BG_CONTROL_HOVER
    : BG_CONTROL;

  const border = isActive
    ? `1px solid ${ACCENT_COLOR}40`
    : hovered
    ? `1px solid ${BORDER_LIGHT}`
    : `1px solid ${BORDER_SUBTLE}`;

  const color = isActive ? TEXT_PRIMARY : TEXT_SECONDARY;

  function handleRemoveClick(e: React.MouseEvent) {
    e.stopPropagation();
    onRemove();
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setRemoveHovered(false); }}
    >
      <button
        data-testid="storage-favorite-chip"
        onClick={onClick}
        title={path}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 30,
          // Extra right padding when hovered to make room for the × badge
          padding: hovered ? '0 26px 0 12px' : '0 12px',
          borderRadius: 8,
          background: bg,
          border,
          color,
          fontSize: 12,
          fontFamily: 'inherit',
          fontWeight: isActive ? 500 : 400,
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',
          transition: 'background 100ms ease, border-color 100ms ease, color 100ms ease, padding 80ms ease',
          whiteSpace: 'nowrap',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>★</span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </button>

      {/* Remove × badge — only on hover */}
        {hovered && (
          <button
            data-testid="storage-favorite-remove"
            onClick={handleRemoveClick}
          onMouseEnter={() => setRemoveHovered(true)}
          onMouseLeave={() => setRemoveHovered(false)}
          title="Remove from favorites"
          style={{
            position: 'absolute',
            top: '50%',
            right: 6,
            transform: 'translateY(-50%)',
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: removeHovered ? 'rgba(255,255,255,0.18)' : BG_CONTROL,
            border: `1px solid ${BORDER_LIGHT}`,
            color: TEXT_MUTED,
            fontSize: 10,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'background 80ms ease',
            zIndex: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ---- Add favorite "+" chip ----

interface AddFavoriteChipProps {
  onClick: () => void;
}

function AddFavoriteChip({ onClick }: AddFavoriteChipProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      data-testid="storage-add-favorite"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Add current location to favorites"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 8,
        background: hovered ? BG_CONTROL_HOVER : BG_CONTROL,
        border: `1px solid ${hovered ? BORDER_LIGHT : BORDER_SUBTLE}`,
        color: TEXT_MUTED,
        fontSize: 16,
        fontFamily: 'inherit',
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        transition: 'background 100ms ease, border-color 100ms ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      +
    </button>
  );
}

// ---- Main component ----

export function StorageSection() {
  const [recordingLocation, setRecordingLocation] = useState('');
  const [volumes, setVolumes] = useState<MountedVolume[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [changeHovered, setChangeHovered] = useState(false);
  const [changePressed, setChangePressed] = useState(false);

  const overrides = (window as any).__roughcutTestOverrides;
  const storageGetRecordingLocation =
    overrides?.storageGetRecordingLocation ?? window.roughcut.storageGetRecordingLocation;
  const storageGetMountedVolumes =
    overrides?.storageGetMountedVolumes ?? window.roughcut.storageGetMountedVolumes;
  const storageGetFavorites = overrides?.storageGetFavorites ?? window.roughcut.storageGetFavorites;
  const storageSetRecordingLocation =
    overrides?.storageSetRecordingLocation ?? window.roughcut.storageSetRecordingLocation;
  const storagePickDirectory = overrides?.storagePickDirectory ?? window.roughcut.storagePickDirectory;
  const storageAddFavorite = overrides?.storageAddFavorite ?? window.roughcut.storageAddFavorite;
  const storageRemoveFavorite =
    overrides?.storageRemoveFavorite ?? window.roughcut.storageRemoveFavorite;

  useEffect(() => {
    Promise.all([
      storageGetRecordingLocation(),
      storageGetMountedVolumes(),
      storageGetFavorites(),
    ]).then(([loc, vols, favs]) => {
      setRecordingLocation(loc);
      setVolumes(vols);
      setFavorites(favs);
    });
  }, [storageGetFavorites, storageGetMountedVolumes, storageGetRecordingLocation]);

  async function handleChange() {
    const path = await storagePickDirectory();
    if (path) {
      await storageSetRecordingLocation(path);
      setRecordingLocation(path);
    }
  }

  async function handleSetLocation(path: string) {
    await storageSetRecordingLocation(path);
    setRecordingLocation(path);
  }

  async function handleAddFavorite() {
    const current = recordingLocation;
    if (current && !favorites.includes(current)) {
      await storageAddFavorite(current);
      setFavorites(prev => [...prev, current]);
    }
  }

  async function handleRemoveFavorite(path: string) {
    await storageRemoveFavorite(path);
    setFavorites(prev => prev.filter(f => f !== path));
  }

  const isLocationFavorited = recordingLocation && favorites.includes(recordingLocation);
  const showAddFavorite = recordingLocation && !isLocationFavorited;
  const hasChips = volumes.length > 0 || favorites.length > 0 || showAddFavorite;

  const changeBg = changePressed
    ? 'rgba(255,255,255,0.14)'
    : changeHovered
    ? BG_CONTROL_HOVER
    : BG_CONTROL;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Section header */}
      <div
        data-testid="storage-section"
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TEXT_MUTED,
          userSelect: 'none',
          marginBottom: 12,
        }}
      >
        Storage
      </div>

      {/* Current location card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: BG_CARD,
          border: `1px solid ${BORDER_SUBTLE}`,
          borderRadius: 12,
          padding: '12px 16px',
        }}
      >
        {/* Left: icon + path */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}>📁</span>
          {recordingLocation ? (
            <span
              data-testid="storage-current-location"
              style={{
                fontSize: 13,
                color: TEXT_PRIMARY,
                // RTL direction trick: shows the trailing segments of the path
                direction: 'rtl',
                textAlign: 'left',
                unicodeBidi: 'plaintext',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
              title={recordingLocation}
            >
              {recordingLocation}
            </span>
          ) : (
            <span
              style={{
                fontSize: 13,
                color: TEXT_TERTIARY,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
                flex: 1,
              }}
              data-testid="storage-current-location"
            >
              ~/Documents/Rough Cut (default)
            </span>
          )}
        </div>

        {/* Right: Change button */}
      <button
        data-testid="storage-change-button"
        onClick={handleChange}
          onMouseEnter={() => setChangeHovered(true)}
          onMouseLeave={() => { setChangeHovered(false); setChangePressed(false); }}
          onMouseDown={() => setChangePressed(true)}
          onMouseUp={() => setChangePressed(false)}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: TEXT_SECONDARY,
            background: changeBg,
            border: `1px solid ${BORDER_SUBTLE}`,
            borderRadius: 8,
            padding: '4px 12px',
            height: 28,
            cursor: 'pointer',
            fontFamily: 'inherit',
            userSelect: 'none',
            outline: 'none',
            flexShrink: 0,
            transition: 'background 100ms ease',
          }}
        >
          Change
        </button>
      </div>

      {/* Quick locations row */}
      {hasChips && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
          }}
        >
          {/* Mounted volumes */}
          {volumes.map(vol => (
            <VolumeChip
              key={vol.path}
              label={vol.name}
              isActive={recordingLocation === vol.path}
              onClick={() => handleSetLocation(vol.path)}
            />
          ))}

          {/* Favorites */}
          {favorites.map(fav => (
            <FavoriteChip
              key={fav}
              path={fav}
              isActive={recordingLocation === fav}
              onClick={() => handleSetLocation(fav)}
              onRemove={() => handleRemoveFavorite(fav)}
            />
          ))}

          {/* Add favorite */}
          {showAddFavorite && (
            <AddFavoriteChip onClick={handleAddFavorite} />
          )}
        </div>
      )}
    </div>
  );
}
