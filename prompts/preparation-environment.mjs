// Private model-free IPC only. The controller hashes this projection and never logs it.
import process from 'node:process';
process.stdout.write(JSON.stringify(process.env));
