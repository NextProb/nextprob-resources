'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const message = JSON.parse(input);
  // The service owns execution. A private request file avoids overlapping a
  // manual invocation with its periodic job. State is outside the workspace.
  const requests = path.join(message.extension.statePath, 'requests');
  fs.mkdirSync(requests, { recursive: true });
  fs.writeFileSync(path.join(requests, `${randomUUID()}.json`), '{}');
  console.log(JSON.stringify({ apiVersion: 1, type: 'log', level: 'info', message: 'Run requested' }));
});
