import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/toast';

function MinimalRenderApp() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        color: '#eee',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Rough Cut minimal renderer
    </div>
  );
}

const useMinimalRender = new URLSearchParams(window.location.search).get('minimal-render') === '1';
const useImportAppOnly = new URLSearchParams(window.location.search).get('import-app-only') === '1';

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);

  if (useImportAppOnly) {
    await import('./App');
    root.render(
      <ToastProvider>
        <MinimalRenderApp />
      </ToastProvider>,
    );
    return;
  }

  if (useMinimalRender) {
    root.render(
      <ToastProvider>
        <MinimalRenderApp />
      </ToastProvider>,
    );
    return;
  }

  const { App } = await import('./App');
  root.render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

void bootstrap();
