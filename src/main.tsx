import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { loadNativeNotebook } from './notebookStorage';
import './style.css';

async function start() {
  // Never render a writable empty notebook while the native data is still loading.
  const notebook = Capacitor.isNativePlatform() ? await loadNativeNotebook() : undefined;
  createRoot(document.getElementById('root')!).render(<StrictMode><App notebook={notebook} /></StrictMode>);
}
void start();
