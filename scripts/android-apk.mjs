import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = process.argv.includes('--release');
if (process.argv.slice(2).some(arg => arg !== '--release')) throw new Error('Usage: npm run android:apk [-- --release]');
if (release && !existsSync(join(root, 'android/keystore.properties'))) {
  console.error('Release signing needs android/keystore.properties. See ANDROID.md.'); process.exit(1);
}
function run(command, args) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], { cwd: root, stdio: 'inherit' })
    : spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run('npm', ['run', 'android:sync']);
const result = spawnSync(process.platform === 'win32' ? 'java.exe' : 'java', ['-version'], { stdio: 'ignore' });
if (result.error && !process.env.JAVA_HOME) {
  console.error('JDK 21 is required. Set JAVA_HOME to Android Studio\'s jbr directory (see ANDROID.md).'); process.exit(1);
}
const gradle = process.platform === 'win32' ? 'android\\gradlew.bat' : './android/gradlew';
run(gradle, ['-p', 'android', release ? 'assembleRelease' : 'assembleDebug']);
const type = release ? 'release' : 'debug';
mkdirSync(join(root, 'artifacts'), { recursive: true });
const output = join(root, 'artifacts', 'quantum-notepad-' + type + '.apk');
copyFileSync(join(root, 'android/app/build/outputs/apk', type, 'app-' + type + '.apk'), output);
console.log('APK: ' + output);
