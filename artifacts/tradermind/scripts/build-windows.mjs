import { spawnSync } from 'node:child_process';
import path from 'node:path';

const appRoot = process.cwd();
const isWindows = process.platform === 'win32';
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';
const env = {
  ...process.env,
  PORT: process.env.PORT ?? '23583',
  BASE_PATH: process.env.BASE_PATH ?? '/',
  TRADERMIND_NATIVE: '1',
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(pnpm, ['run', 'build:web']);
run(pnpm, [
  'exec',
  'electron-builder',
  '--config',
  path.join(appRoot, 'electron-builder.config.cjs'),
  '--win',
  '--x64',
]);

console.info(
  `Windows x64 installer and portable app: ${path.join(appRoot, 'dist/windows')}`,
);
