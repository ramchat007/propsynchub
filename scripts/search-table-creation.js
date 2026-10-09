const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/rupesh.mestry/.gemini/antigravity/brain/5cce820e-9172-41c8-aa66-c297053114c1/.system_generated/logs/transcript.jsonl'),
  crlfDelay: Infinity
});
rl.on('line', (line) => {
  if (line.includes('email_otps') || line.includes('ALTER TABLE') || line.includes('CREATE TABLE')) {
    try {
      const obj = JSON.parse(line);
      console.log(`[Step ${obj.step_index}] source=${obj.source} type=${obj.type}`);
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          console.log(`  tool: ${tc.name}`, tc.args?.CommandLine || tc.args?.TargetFile || '');
        }
      }
      if (obj.content && obj.content.length < 500) {
        console.log(`  content: ${obj.content.slice(0, 300)}`);
      }
    } catch(e) {}
  }
});
