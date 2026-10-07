const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/rupesh.mestry/.gemini/antigravity/brain/5cce820e-9172-41c8-aa66-c297053114c1/.system_generated/logs/transcript.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const obj = JSON.parse(line);
    if (obj.tool_calls) {
      for (const call of obj.tool_calls) {
        if (call.name === 'run_command' && call.args && call.args.CommandLine) {
          const cmd = call.args.CommandLine;
          if (cmd.includes('migration') || cmd.includes('supabase') || cmd.includes('.sql') || cmd.includes('db')) {
            console.log(`[Step ${obj.step_index}] ${cmd}`);
          }
        }
      }
    }
  } catch(e) {}
});
