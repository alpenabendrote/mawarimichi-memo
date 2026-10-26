import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
let html = read('dist/index.html');
html = html.replace(/<script\b[^>]*\bsrc="(\/assets\/[^"]+)"[^>]*><\/script>/g, (_, path) =>
  '<script type="module">' + read('dist' + path).replace(/<\/script/gi, '<\\/script') + '</script>');
html = html.replace(/<link\b[^>]*\bhref="(\/assets\/[^"]+\.css)"[^>]*>/g, (_, path) =>
  '<style>' + read('dist' + path).replace(/<\/style/gi, '<\\/style') + '</style>');
if (/<(?:script|link)\b[^>]*(?:src|href)="\/assets\//.test(html)) throw Error('Standalone build has unresolved assets');
if (!html.includes('The above copyright notice and this permission notice')) throw Error('Standalone build lost its license text');
mkdirSync(new URL('artifacts/', root), { recursive: true });
writeFileSync(new URL('artifacts/quantum-notes.html', root), html);
console.log('Exported artifacts/quantum-notes.html with bundled licenses.');
