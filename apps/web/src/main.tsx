import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-ext-400.css';
import '@fontsource/ibm-plex-sans/latin-ext-500.css';
import '@fontsource/ibm-plex-sans/latin-ext-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-600.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createServices, ServicesProvider } from './app/services';
import { initTheme } from './app/theme';
import { initI18n } from './i18n/config';

initTheme();
await initI18n();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

const services = await createServices();
// Never lose the last edits: write as soon as the tab is hidden (usually before it closes),
// and ask the browser to confirm leaving while a write is still pending.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void services.session.flush();
});
window.addEventListener('pagehide', () => void services.session.flush());
window.addEventListener('beforeunload', (event) => {
  const { saveState } = services.session.getState();
  if (saveState === 'pending' || saveState === 'saving') {
    void services.session.flush();
    event.preventDefault();
  }
});

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
