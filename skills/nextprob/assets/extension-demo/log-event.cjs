'use strict';

// A hook can be any executable that reads its single JSON input from stdin.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const message = JSON.parse(input);
  console.log(JSON.stringify({ apiVersion: 1, type: 'log', level: 'info',
    message: `Observed ${message.event.name}: ${JSON.stringify(message.event.data)}` }));
});
