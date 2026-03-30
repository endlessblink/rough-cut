import React from 'react';
import { createRoot } from 'react-dom/client';
import { PanelApp } from './features/record/PanelApp';

const rootEl = document.getElementById('panel-root');
if (!rootEl) throw new Error('Missing #panel-root element');

createRoot(rootEl).render(
  <React.StrictMode>
    <PanelApp />
  </React.StrictMode>,
);
