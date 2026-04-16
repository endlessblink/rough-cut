import React from 'react';
import { createRoot } from 'react-dom/client';
import { PanelApp } from './features/record/PanelApp';
import { ToastProvider } from './ui/toast';

const rootEl = document.getElementById('panel-root');
if (!rootEl) throw new Error('Missing #panel-root element');

createRoot(rootEl).render(
  <React.StrictMode>
    <ToastProvider>
      <PanelApp />
    </ToastProvider>
  </React.StrictMode>,
);
