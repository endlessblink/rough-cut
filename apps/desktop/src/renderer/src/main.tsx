import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

declare global {
  interface Window {
    roughCut: {
      getVersion: () => Promise<string>;
      channels: Record<string, string>;
    };
  }
}

function App() {
  const [version, setVersion] = React.useState<string>('loading');

  React.useEffect(() => {
    window.roughCut.getVersion().then(setVersion).catch(() => setVersion('unknown'));
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Rough Cut MVP</p>
        <h1>Screen recording first. Everything else later.</h1>
        <p className="lede">
          This fresh app starts from the stable Rough Cut libraries and keeps orchestration small.
        </p>
        <div className="panel">
          <button type="button" disabled>
            Record
          </button>
          <span>Recording flow lands in Phase 2.</span>
        </div>
        <p className="version">Electron app version: {version}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
