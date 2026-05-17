import React from 'react';

// Card-corner selection checkbox. Element is <span role="checkbox"> rather
// than <button> because the card itself is already a <button> — nested
// interactive content triggers React warnings + breaks focus/keyboard
// behavior. The role + tabIndex + key handlers preserve accessibility.
//
// stopPropagation on click + keydown so toggling the checkbox doesn't also
// fire the card's open/select handler.
export function CardCheckbox({ checked, onChange, label }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  function toggle(event: React.SyntheticEvent) {
    event.stopPropagation();
    onChange(!checked);
  }

  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      className={`cardCheckbox ${checked ? 'isChecked' : ''}`}
      onClick={toggle}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          toggle(event);
        }
      }}
    >
      <span className="cardCheckboxGlyph" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
    </span>
  );
}
