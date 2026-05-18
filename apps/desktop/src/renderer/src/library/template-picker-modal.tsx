import React from 'react';
import { TEMPLATE_STUBS } from './template-stubs.mjs';
import type { TemplateStub } from './template-stubs.mjs';

// P-AI-C/TASK-170 — stub template picker. Closes on Esc + backdrop click.
// Selecting a template fires `onSelect(stub)`; the host (LibraryShell)
// creates a blank project with the corresponding aspect ratio. No template
// pipeline execution (auto-transcribe etc.) — that's TASK-146.
export function TemplatePickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (template: TemplateStub) => void;
}) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="templatePickerBackdrop"
      data-testid="template-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="templatePickerModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-picker-title"
        data-testid="template-picker-modal"
      >
        <header className="templatePickerHeader">
          <h2 id="template-picker-title">Pick a template</h2>
          <button
            type="button"
            className="templatePickerClose"
            aria-label="Close template picker"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <ul className="templatePickerList">
          {TEMPLATE_STUBS.map((stub) => (
            <li key={stub.id}>
              <button
                type="button"
                className="templatePickerCard"
                data-testid={`template-card-${stub.id}`}
                onClick={() => onSelect(stub)}
              >
                <span className="templatePickerCardLabel">{stub.label}</span>
                <span className="templatePickerCardAspect">{stub.aspectRatio}</span>
                <span className="templatePickerCardDesc">{stub.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
