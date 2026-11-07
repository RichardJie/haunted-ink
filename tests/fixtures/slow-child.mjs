// Test fixture only: a process that never answers, used to test process-group killing.
// It is not a model and never produces a model response.
import { spawn } from 'node:child_process';

const [, self, marker, mode] = process.argv;
if (mode === 'stubborn') process.on('SIGTERM', () => {});
// 'session' mode: emit one stream-json lifecycle event with a fixed fake id (no model content).
if (mode === 'session') process.stdout.write('{"type":"sessionUpdate","data":{"sessionId":"sess_fixture-0001"}}\n');
if (mode !== '--grandchild') {
  spawn(process.execPath, [self, marker, '--grandchild'], { stdio: 'ignore' });
  process.stdin.resume();
}
setInterval(() => {}, 1000);
