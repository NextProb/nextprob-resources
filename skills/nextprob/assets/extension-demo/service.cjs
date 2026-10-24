'use strict';

const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const send = message => process.stdout.write(`${JSON.stringify({ apiVersion: 1, ...message })}\n`);
const status = (state, text) => send({ type: 'status', state, text });
const log = (level, message) => send({ type: 'log', level, message: String(message).slice(0, 4000) });
let context, requests, periodic, inbox, debounce, child;
let pending = false, stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(periodic); clearInterval(inbox); clearTimeout(debounce);
  if (child) child.kill();
  // Host process-group cleanup also stops descendants.
  process.exit(0);
}

function run() {
  if (stopping || !context) return;
  if (child) { pending = true; return; }
  const settings = context.extension.settings;
  if (typeof settings.command !== 'string' || !settings.command.trim()) {
    status('ready', 'Set command and args in extension settings to run your tool.');
    return;
  }
  if (!Array.isArray(settings.args) || settings.args.some(arg => typeof arg !== 'string')) {
    status('error', 'args must be an array of strings'); return;
  }
  let executable = settings.command;
  const env = { ...process.env };
  if (executable === 'node') {
    executable = process.execPath;
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  }
  status('running', `Running ${settings.command}`);
  let failed = false;
  child = spawn(executable, settings.args, { cwd: context.workspace.path, env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => log('info', chunk.toString('utf8')));
  child.stderr.on('data', chunk => log('warn', chunk.toString('utf8')));
  child.on('error', error => { failed = true; status('error', error.message); });
  child.on('close', code => {
    child = null;
    if (stopping) return;
    if (!failed) {
      status(code === 0 ? 'ready' : 'error', code === 0 ? 'Tool completed' : `Tool exited ${code}`);
      if (code === 0 && Array.isArray(settings.refreshPaths) && settings.refreshPaths.length)
        send({ type: 'refresh', paths: settings.refreshPaths });
    }
    if (pending) { pending = false; run(); }
  });
}

function initialize(message) {
  context = message;
  requests = path.join(message.extension.statePath, 'requests');
  fs.mkdirSync(requests, { recursive: true });
  // Only one tool invocation runs at a time. Requests arriving during a run
  // coalesce into one further invocation rather than spawning concurrent jobs.
  inbox = setInterval(() => {
    try {
      const entries = fs.readdirSync(requests).filter(name => /^[a-f0-9-]+\.json$/.test(name));
      if (!entries.length) return;
      for (const name of entries) fs.unlinkSync(path.join(requests, name));
      run();
    } catch (error) { log('error', error.message); }
  }, 250);
  const seconds = Number(message.extension.settings.intervalSeconds);
  if (Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400)
    periodic = setInterval(run, seconds * 1000);
  run();
}

readline.createInterface({ input: process.stdin }).on('line', line => {
  try {
    const message = JSON.parse(line);
    if (message.apiVersion !== 1) return;
    if (message.type === 'initialize' && !context) initialize(message);
    if (message.event?.name === 'workspace.closing') stop();
    if (message.event?.name === 'workspace.filesChanged' && context?.extension.settings.runOnChange) {
      clearTimeout(debounce); debounce = setTimeout(run, 500);
    }
  } catch (error) { log('error', error.message); }
}).on('close', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
