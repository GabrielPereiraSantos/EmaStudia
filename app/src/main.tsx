import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/quicksand/latin-500.css';
import '@fontsource/quicksand/latin-600.css';
import '@fontsource/quicksand/latin-700.css';
import './index.css';
import { App } from './App';
import { initPwa } from './lib/pwa';

initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
