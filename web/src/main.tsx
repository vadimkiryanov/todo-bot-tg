import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Стили @telegram-apps/telegram-ui идут первыми: app.css ниже переопределяет
// токены библиотеки (--tg-theme-*) своими — «побеждает» тот, кто позже.
import '@telegram-apps/telegram-ui/dist/styles.css';
import './app.css';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
