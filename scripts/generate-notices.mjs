import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const lock = JSON.parse(read('package-lock.json'));
const sections = [
  'Quantum Notepad — licenses and third-party notices\n\nThe original application is MIT licensed. Third-party components retain their own licenses.\nBuild tools run during development; their generated browser helpers are attributed separately below.',
  'Original application\n\n' + read('LICENSE'),
];
for (const [path, pkg] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  if (!path || pkg.dev) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 13);
  const files = readdirSync(new URL(path + '/', root))
    .filter(file => /^(licen[cs]e|notice|copyright)([._-]|$)/i.test(file))
    .sort();
  if (!files.some(file => /^licen[cs]e([._-]|$)/i.test(file))) throw Error('Missing license for runtime dependency ' + name);
  sections.push(name + '@' + pkg.version + '\n' + (pkg.resolved ?? '') + '\n\n'
    + (name === '@capacitor/synapse' ? 'The package metadata says ISC, but the distributed LICENSE.md grants MIT. The actual license follows.\n\n' : '')
    + files.map(file => file + '\n\n' + read(path + '/' + file)).join('\n\n'));
}
for (const [name, license] of [['vite', 'LICENSE.md'], ['rolldown', 'LICENSE']]) {
  const pkg = JSON.parse(read('node_modules/' + name + '/package.json'));
  // Only browser helpers are emitted, not the tool or its bundled build-time dependencies.
  const text = read('node_modules/' + name + '/' + license).split('\n# Licenses of bundled dependencies')[0].trimEnd();
  sections.push(name + '@' + pkg.version + ' — generated browser helpers\n\n' + text);
}
sections.push('Android native components (APK only)\n\nAndroidX libraries, Kotlin standard library, Kotlin coroutines, JetBrains annotations, Apache Cordova, JSpecify annotations, and Google Guava/Error Prone support libraries (when resolved): Apache License 2.0.\nThe exact resolved native component versions and additional LICENSE/NOTICE files from their AAR/JAR archives are collected at build time in the APK asset native-third-party-notices.txt.\n\nApache Cordova NOTICE\n\n' + read('licenses/cordova-NOTICE.txt') + '\n\nKotlin\nCopyright 2010-2025 JetBrains s.r.o. and Kotlin Programming Language contributors.\n\nCapacitor includes WebViewLocalServer code under Apache License 2.0:\nCopyright 2015 Google Inc. All rights reserved.\n\n' + read('licenses/Apache-2.0.txt'));
sections.push('io.ionic.libs:ionfilesystem-android:1.1.1 (APK only)\nhttps://github.com/ionic-team/ion-android-filesystem\n\n' + read('licenses/ionfilesystem-LICENSE.txt'));
sections.push('Gradle wrapper (repository/build tooling only)\nhttps://gradle.org/\nApache License 2.0. The wrapper JAR retains its embedded META-INF/LICENSE, and the launch scripts retain their original headers.');
const text = sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
writeFileSync(new URL('THIRD_PARTY_NOTICES.txt', root), text);
mkdirSync(new URL('public/', root), { recursive: true });
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) writeFileSync(new URL('public/' + name, root), read(name) + '\n');
console.log('Generated runtime licenses from the installed, locked dependencies.');
