import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, '.astro');
const stateFile = path.join(stateDir, 'background-dev.json');
const stdoutFile = path.join(stateDir, 'background-dev.stdout.log');
const stderrFile = path.join(stateDir, 'background-dev.stderr.log');
const astroCli = path.join(root, 'node_modules', 'astro', 'astro.js');
const host = '127.0.0.1';
const port = 4321;
const url = `http://${host}:${port}/`;

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function portIsOpen(timeout = 750) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function tail(file, maxCharacters = 5000) {
  if (!existsSync(file)) return '';
  const contents = readFileSync(file, 'utf8');
  return contents.slice(-maxCharacters);
}

async function start() {
  const current = readState();
  if (current && processIsRunning(current.pid) && (await portIsOpen())) {
    console.log(`Astro is already running at ${current.url ?? url} (PID ${current.pid}).`);
    return;
  }

  if (await portIsOpen()) {
    throw new Error(`Port ${port} is already occupied by another process.`);
  }

  if (!existsSync(astroCli)) {
    throw new Error('Astro is not installed. Run npm install before starting the dev server.');
  }

  mkdirSync(stateDir, { recursive: true });
  rmSync(stateFile, { force: true });

  const stdout = openSync(stdoutFile, 'a');
  const stderr = openSync(stderrFile, 'a');
  const child = spawn(
    process.execPath,
    [astroCli, 'dev', '--host', host, '--port', String(port), ...process.argv.slice(3)],
    {
      cwd: root,
      detached: true,
      env: process.env,
      stdio: ['ignore', stdout, stderr],
      windowsHide: true,
    },
  );

  closeSync(stdout);
  closeSync(stderr);
  child.unref();

  const state = {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    url,
  };
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!processIsRunning(child.pid)) {
      rmSync(stateFile, { force: true });
      throw new Error(`Astro exited during startup.\n${tail(stderrFile)}`);
    }

    if (await portIsOpen()) {
      console.log(`Astro is running at ${url} (PID ${child.pid}).`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Astro did not open port ${port} within 45 seconds.\n${tail(stderrFile)}`);
}

async function status() {
  const state = readState();
  if (!state) {
    console.log('Astro is stopped.');
    process.exitCode = 1;
    return;
  }

  const running = processIsRunning(state.pid);
  const listening = await portIsOpen();
  if (!running || !listening) {
    console.log(`Astro is not healthy (PID ${state.pid}, port ${port} ${listening ? 'open' : 'closed'}).`);
    process.exitCode = 1;
    return;
  }

  const uptime = Math.max(0, Math.round((Date.now() - Date.parse(state.startedAt)) / 1000));
  console.log(`Astro is running at ${state.url ?? url} (PID ${state.pid}, uptime ${uptime}s).`);
}

function stop() {
  const state = readState();
  if (!state) {
    console.log('Astro is already stopped.');
    return;
  }

  if (processIsRunning(state.pid)) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-state.pid, 'SIGTERM');
      } catch {
        process.kill(state.pid, 'SIGTERM');
      }
    }
  }

  rmSync(stateFile, { force: true });
  console.log('Astro dev server stopped.');
}

function logs() {
  const output = tail(stdoutFile, 30_000);
  const errors = tail(stderrFile, 30_000);
  if (!output && !errors) {
    console.log('No background dev-server logs yet.');
    return;
  }

  if (output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  if (errors) process.stderr.write(errors.endsWith('\n') ? errors : `${errors}\n`);
}

const command = process.argv[2] ?? 'start';

try {
  if (command === 'start') await start();
  else if (command === 'status') await status();
  else if (command === 'stop') stop();
  else if (command === 'logs') logs();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
