const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/rupesh.mestry/.gemini/antigravity/brain/5cce820e-9172-41c8-aa66-c297053114c1/.system_generated/logs/transcript.jsonl'),
  crlfDelay: Infinity
});
rl.on('line', (line) => {
  const o = JSON.parse(line);
  if (o.step_index === 1922 || o.step_index === 2296) {
    console.log(JSON.stringify(o, null, 2));
  }
});
