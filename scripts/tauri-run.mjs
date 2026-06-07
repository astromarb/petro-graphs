// Ensures ~/.cargo/bin is on PATH before invoking the Tauri CLI.
// Needed when the terminal (e.g. PyCharm) launched before Rust was installed
// and hasn't picked up the updated user PATH yet.
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
if (!process.env.PATH?.includes(cargoBin)) {
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH}`;
}

const args = process.argv.slice(2); // e.g. ['dev'] or ['build']
const child = spawn('npx', ['tauri', ...args], { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
