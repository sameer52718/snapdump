import { spawn } from 'node:child_process';

export interface RunCmdOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runCmd(command: string, args: string[], options: RunCmdOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (c) => {
      stderr += c.toString();
    });
    child.stdout?.on('data', (c) => {
      stdout += c.toString();
    });

    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn ${command}: ${err.message}. Is "${command}" installed and on PATH?`,
        ),
      );
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = [stdout, stderr].filter(Boolean).join('\n').trim();
      reject(
        new Error(
          `${command} exited with code ${code}${signal ? ` signal ${signal}` : ''}${tail ? `\n${tail}` : ''}`,
        ),
      );
    });
  });
}
