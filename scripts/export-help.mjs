import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const notices = readFileSync(new URL('THIRD_PARTY_NOTICES.txt', root), 'utf8');
const escapedNotices = notices.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]));
const content = readFileSync(new URL('src/help-content.html', root), 'utf8').replace('<!-- LICENSE_TEXT -->', () => escapedNotices);
const css = readFileSync(new URL('src/help.css', root), 'utf8');
const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate help anchor');
for (const match of content.matchAll(/href="#([^"]+)"/g)) {
  if (!ids.includes(match[1])) throw new Error(`Missing help anchor: ${match[1]}`);
}
const document = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>メモ帳のヘルプ</title>
<style>
:root{font-family:system-ui,"Yu Gothic UI",sans-serif;color:#222;background:white;font-synthesis:none}*{box-sizing:border-box}body{margin:0;padding:32px 20px}code{font-family:ui-monospace,Consolas,monospace}:focus-visible{outline:2px solid #666;outline-offset:2px}
${css}
@media print{body{padding:0}.help-article{max-width:none;font-size:10pt}.help-toc{break-inside:avoid}.help-article h2,.help-article h3{break-after:avoid}.help-article tr{break-inside:avoid}.help-article a{color:inherit}}
</style></head><body><main>${content}</main></body></html>
`;
writeFileSync(new URL('HELP.html', root), document, 'utf8');
console.log('Exported HELP.html from the in-app help');
