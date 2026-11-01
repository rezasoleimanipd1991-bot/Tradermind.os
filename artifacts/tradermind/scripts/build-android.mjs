import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const appRoot = process.cwd();
const isWindows = process.platform === 'win32';
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';
const androidDir = path.join(appRoot, 'android');
const mode = process.argv[2] === 'release' ? 'release' : 'debug';
const env = {
  ...process.env,
  PORT: process.env.PORT ?? '23583',
  BASE_PATH: process.env.BASE_PATH ?? '/',
  TRADERMIND_NATIVE: '1',
};

function run(command, args, cwd = appRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  console.error(
    'Android SDK was not found. Install Android Studio/SDK and set ANDROID_HOME, or run this build in GitHub Actions.',
  );
  process.exit(1);
}

const signing = {
  storeFile: process.env.ANDROID_KEYSTORE_FILE,
  storePassword: process.env.ANDROID_KEYSTORE_PASSWORD,
  keyAlias: process.env.ANDROID_KEY_ALIAS,
  keyPassword: process.env.ANDROID_KEY_PASSWORD,
};

if (mode === 'release') {
  const missing = Object.entries(signing)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    console.error(`Release build needs signing values: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!existsSync(signing.storeFile)) {
    console.error(`Keystore file not found: ${signing.storeFile}`);
    process.exit(1);
  }
}

run(pnpm, ['run', 'build:web']);

if (
  !existsSync(path.join(androidDir, 'gradlew')) &&
  !existsSync(path.join(androidDir, 'gradlew.bat'))
) {
  run(pnpm, ['exec', 'cap', 'add', 'android']);
}

run(pnpm, ['exec', 'cap', 'sync', 'android']);

// همگام‌سازی با نرم‌افزار ویندوز روی شبکه‌ی خانگی/Tailscale با http است؛
// اندروید به‌طور پیش‌فرض http را نمی‌پذیرد، پس در Manifest اجازه‌اش را می‌دهیم.
const manifestPath = path.join(androidDir, 'app/src/main/AndroidManifest.xml');
if (existsSync(manifestPath)) {
  const manifest = readFileSync(manifestPath, 'utf8');
  if (!/android:usesCleartextTraffic\s*=/.test(manifest)) {
    writeFileSync(
      manifestPath,
      manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"'),
    );
    console.info('AndroidManifest: usesCleartextTraffic enabled for local sync.');
  }
}

// ورژن اپ را از package.json می‌خوانیم و در build.gradle می‌گذاریم (فقط در حالت release).
if (mode === 'release') {
  const pkg = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const versionName = pkg.version;
  const [major = 0, minor = 0, patch = 0] = versionName
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const versionCode = process.env.ANDROID_VERSION_CODE
    ? Number.parseInt(process.env.ANDROID_VERSION_CODE, 10)
    : major * 10000 + minor * 100 + patch;

  const gradleFilePath = path.join(androidDir, 'app/build.gradle');
  if (existsSync(gradleFilePath)) {
    let content = readFileSync(gradleFilePath, 'utf8');
    const hasCode = /versionCode\s*=?\s*\d+/.test(content);
    const hasName = /versionName\s*=?\s*"[^"]*"/.test(content);
    if (hasCode && hasName) {
      content = content
        .replace(/versionCode\s*=?\s*\d+/, `versionCode ${versionCode}`)
        .replace(/versionName\s*=?\s*"[^"]*"/, `versionName "${versionName}"`);
      writeFileSync(gradleFilePath, content);
      console.info(`build.gradle: versionName ${versionName}, versionCode ${versionCode}`);
    } else {
      console.warn('build.gradle: versionCode/versionName not found, version was not updated.');
    }
  }
}

const gradle = isWindows
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');

const gradleArgs = ['--no-daemon'];
if (mode === 'release') {
  gradleArgs.push(
    'assembleRelease',
    `-Pandroid.injected.signing.store.file=${signing.storeFile}`,
    `-Pandroid.injected.signing.store.password=${signing.storePassword}`,
    `-Pandroid.injected.signing.key.alias=${signing.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${signing.keyPassword}`,
  );
} else {
  gradleArgs.push('assembleDebug');
}

run(gradle, gradleArgs, androidDir);

const outputName = mode === 'release' ? 'release/app-release.apk' : 'debug/app-debug.apk';
console.info(`Android ${mode} APK: ${path.join(androidDir, 'app/build/outputs/apk', outputName)}`);
