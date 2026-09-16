import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function git(cwd, args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }); }
  catch { return null; }
}

function gitRoot(cwd) {
  const root = git(cwd, ['rev-parse', '--show-toplevel'])?.trimEnd();
  return root ? fs.realpathSync(root) : null;
}

// Codex deliberately reads linked-worktree hooks from the primary checkout.
export function codexSettingsPath(workspace) {
  const root = gitRoot(workspace);
  if (!root) return path.join(workspace, '.codex/hooks.json');
  const record = git(workspace, ['worktree', 'list', '--porcelain', '-z'])?.split('\0')[0];
  if (!record?.startsWith('worktree ')) throw new Error('Cannot resolve primary checkout for Codex hooks');
  const primary = fs.realpathSync(record.slice('worktree '.length));
  return path.join(primary, path.relative(root, workspace), '.codex/hooks.json');
}

export function matchesWorkspace(workspace, cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return false;
  try {
    workspace = fs.realpathSync(workspace);
    cwd = fs.realpathSync(cwd);
    const relative = path.relative(workspace, cwd);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    // Exclude another worktree or nested repository even if it is a child directory.
    return gitRoot(workspace) === gitRoot(cwd);
  } catch { return false; }
}

// Different worktree installations may share one authoritative hooks file.
export function withSettingsLocks(files, fn) {
  const acquired = [];
  try {
    for (const file of [...new Set(files)].sort()) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const lock = `${file}.conversation-ledger.lock`;
      try { fs.mkdirSync(lock); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error(`Another installation may be running. Inspect ${lock} before removing a stale lock.`);
        throw error;
      }
      acquired.push(lock);
    }
    return fn();
  } finally { for (const lock of acquired.reverse()) fs.rmdirSync(lock); }
}
