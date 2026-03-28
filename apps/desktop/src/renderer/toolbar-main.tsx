import { createRoot } from 'react-dom/client';
import { FloatingToolbar } from './features/record/FloatingToolbar';

const container = document.getElementById('toolbar-root');
if (!container) throw new Error('toolbar-root element not found');

const root = createRoot(container);
root.render(<FloatingToolbar />);
