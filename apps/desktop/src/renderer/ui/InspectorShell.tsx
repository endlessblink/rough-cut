/**
 * InspectorShell — reusable inspector layout with icon rail.
 * Replaces the stacked InspectorCard pattern where a panel needs
 * category switching via a vertical icon rail on the left side.
 */
import React, { useEffect, useState } from 'react';
import {
  TEXT_SECONDARY,
  TEXT_MUTED,
  CARD_PADDING_X,
  CARD_PADDING_Y_TOP,
  CARD_PADDING_Y_BOTTOM,
  SECTION_GAP,
} from './tokens.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectorCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  panel: React.ReactNode;
  onReset?: () => void;
}

export interface InspectorShellProps {
  categories: InspectorCategory[];
  width: number;
  preferredCategoryId?: string | null;
}

// ─── InspectorShell ───────────────────────────────────────────────────────────

export function InspectorShell({
  categories,
  width,
  preferredCategoryId = null,
}: InspectorShellProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? '');

  useEffect(() => {
    if (!preferredCategoryId) return;
    if (!categories.some((category) => category.id === preferredCategoryId)) return;
    setActiveCategoryId((current) =>
      current === preferredCategoryId ? current : preferredCategoryId,
    );
  }, [categories, preferredCategoryId]);

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0];

  return (
    <aside
      data-testid="inspector-shell"
      style={{
        flex: `0 0 ${width}px`,
        maxWidth: width,
        borderRadius: 14,
        background:
          'radial-gradient(circle at 0% 0%, rgba(255,255,255,0.05) 0%, rgba(8,8,8,1) 50%, #050505 100%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'row',
        overflowX: 'hidden',
        overflowY: 'hidden',
      }}
    >
      {/* Icon rail */}
      <IconRail
        categories={categories}
        activeCategoryId={activeCategoryId}
        onSelect={setActiveCategoryId}
      />

      {/* Content area */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'hidden',
        }}
      >
        {/* Category header */}
        <CategoryHeader label={activeCategory?.label ?? ''} onReset={activeCategory?.onReset} />

        {/* Panel body */}
        <div
          data-testid="inspector-card-active"
          data-category={activeCategory?.id ?? ''}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: `${CARD_PADDING_Y_TOP}px ${CARD_PADDING_X}px ${CARD_PADDING_Y_BOTTOM}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: SECTION_GAP,
          }}
        >
          {activeCategory?.panel ?? null}
        </div>
      </div>
    </aside>
  );
}

// ─── IconRail ─────────────────────────────────────────────────────────────────

interface IconRailProps {
  categories: InspectorCategory[];
  activeCategoryId: string;
  onSelect: (id: string) => void;
}

function IconRail({ categories, activeCategoryId, onSelect }: IconRailProps) {
  return (
    <div
      data-testid="inspector-rail"
      style={{
        width: 36,
        flexShrink: 0,
        background: 'rgba(0,0,0,0.30)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        gap: 2,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        // Clip to the left border-radius of the aside
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
      }}
    >
      {categories.map((cat) => (
        <RailButton
          key={cat.id}
          categoryId={cat.id}
          icon={cat.icon}
          label={cat.label}
          active={cat.id === activeCategoryId}
          onClick={() => onSelect(cat.id)}
        />
      ))}
    </div>
  );
}

// ─── RailButton ───────────────────────────────────────────────────────────────

interface RailButtonProps {
  categoryId: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function RailButton({ categoryId, icon, label, active, onClick }: RailButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      data-testid="inspector-rail-item"
      data-category={categoryId}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active
          ? 'rgba(255,255,255,0.10)'
          : hovered
            ? 'rgba(255,255,255,0.06)'
            : 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        padding: 0,
        transition: 'background 80ms ease',
        color: active ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.35)',
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}

// ─── CategoryHeader ───────────────────────────────────────────────────────────

interface CategoryHeaderProps {
  label: string;
  onReset?: () => void;
}

function CategoryHeader({ label, onReset }: CategoryHeaderProps) {
  const [resetHovered, setResetHovered] = useState(false);

  return (
    <div
      style={{
        height: 28,
        minHeight: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px 0 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: TEXT_SECONDARY,
          userSelect: 'none',
        }}
      >
        {label}
      </span>

      {onReset && (
        <button
          onClick={onReset}
          onMouseEnter={() => setResetHovered(true)}
          onMouseLeave={() => setResetHovered(false)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 11,
            color: resetHovered ? 'rgba(255,255,255,0.80)' : TEXT_MUTED,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'color 100ms ease',
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
