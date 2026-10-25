import { defineConfig } from 'vite';

// Keep the build self-contained for the APK and the downloadable single HTML version.
export default defineConfig({ build: { rolldownOptions: { output: { codeSplitting: false } } } });
