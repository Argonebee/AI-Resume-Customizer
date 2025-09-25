// run-in-background.js
// Spawn server.js as a detached background process so the current terminal isn't blocked.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, 'server.js');

const child = spawn(process.execPath, [serverPath], {
  detached: true,
  stdio: 'ignore',
});

// Write the child PID to a file so we can stop it later
try {
  writeFileSync(path.join(__dirname, 'server.pid'), String(child.pid), { encoding: 'utf8' });
} catch (e) {
  // ignore write errors
}

child.unref();
console.log('Server started in background (detached). PID written to server.pid');
