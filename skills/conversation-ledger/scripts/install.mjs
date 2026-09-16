import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicWrite, configFor, digest, json, localDir, readJSON } from './core.mjs';
import { codexSettingsPath, withSettingsLocks } from './workspace.mjs';

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS = ['codex', 'claude-code', 'pi'];
export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function loadSettings(file) {
  const data = fs.existsSync(file) ? readJSON(file) : {};
  if (!plainObject(data) || (data.hooks !== undefined && !plainObject(data.hooks))) throw new Error(`Invalid hook settings: ${file}`);
  for (const groups of Object.values(data.hooks || {})) {
    if (!Array.isArray(groups) || groups.some((group) => !plainObject(group) || !Array.isArray(group.hooks) || group.hooks.some((hook) => !plainObject(hook)))) {
      throw new Error(`Invalid hook groups: ${file}`);
    }
  }
  return data;
}

function stripOwned(settings, commands) {
  if (!settings.hooks) return settings;
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = [];
    for (const group of groups) {
      const handlers = group.hooks.filter((hook) => !commands.includes(hook.command));
      if (handlers.length === group.hooks.length) kept.push(group);
      else if (handlers.length) kept.push({ ...group, hooks: handlers });
    }
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return settings;
}

function bundleFiles(directory = SOURCE, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (!prefix && !['SKILL.md', 'references', 'assets', 'agents', 'scripts'].includes(entry.name)) return [];
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) return bundleFiles(path.join(directory, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Unsupported bundle entry: ${relative}`);
    return [{ relative, content: fs.readFileSync(path.join(directory, entry.name)) }];
  });
}

function withInstallLock(workspace, fn) {
  const local = localDir(workspace);
  fs.mkdirSync(local, { recursive: true });
  const lock = path.join(local, 'install.lock');
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another installation may be running. Inspect ${lock} before removing a stale lock.`);
    throw error;
  }
  try { return fn(local); } finally { fs.rmdirSync(lock); }
}

export function install(workspace, hosts = HOSTS, selectedRoot) {
  if (process.platform === 'win32') throw new Error('Automatic hook installation currently supports macOS and Linux');
  workspace = fs.realpathSync(workspace);
  hosts = [...new Set(hosts)];
  if (!hosts.length || hosts.some((host) => !HOSTS.includes(host))) throw new Error(`Choose agents from: ${HOSTS.join(', ')}`);
  return withInstallLock(workspace, (local) => {
    const runtimeFile = path.join(local, 'runtime.json');
    const previous = fs.existsSync(runtimeFile) ? readJSON(runtimeFile) : null;
    if (previous && previous.version !== 1) throw new Error('Unsupported existing runtime configuration');
    const mappingFile = path.join(local, 'location.json');
    const mapping = fs.existsSync(mappingFile) ? readJSON(mappingFile) : null;
    if (mapping && (mapping.version !== 1 || typeof mapping.root !== 'string' || !mapping.root)) throw new Error('Invalid existing location mapping');
    const root = path.resolve(workspace, selectedRoot ?? mapping?.root ?? '.conversation-ledger/data');
    if (!fs.existsSync(root)) {
      if (mapping && selectedRoot === undefined) throw new Error(`Configured ledger root unavailable: ${root}`);
      if (!fs.existsSync(path.dirname(root))) throw new Error(`Ledger parent directory does not exist: ${path.dirname(root)}`);
    } else if (!fs.statSync(root).isDirectory()) throw new Error(`Ledger root is not a directory: ${root}`);

    const allHosts = [...new Set([...(previous?.managed_hosts || previous?.hosts || []), ...hosts])];
    const settingsPaths = { codex: allHosts.includes('codex') ? codexSettingsPath(workspace) : path.join(workspace, '.codex/hooks.json'), 'claude-code': path.join(workspace, '.claude/settings.local.json') };
    const settingsFiles = [...new Set([
      ...allHosts.filter((host) => host !== 'pi').map((host) => settingsPaths[host]),
      ...(previous?.settings_files || []),
      ...(previous?.commands?.length ? [path.join(workspace, '.codex/hooks.json'), path.join(workspace, '.claude/settings.local.json')].filter((file) => fs.existsSync(file)) : []),
    ])];
    return withSettingsLocks(settingsFiles, () => {
      const settings = {};
      // Read every affected settings file before changing any of them.
      for (const file of settingsFiles) settings[file] = loadSettings(file);
      const extension = path.join(workspace, '.pi/extensions/conversation-ledger.ts');
      const existingExtension = fs.existsSync(extension) ? fs.readFileSync(extension, 'utf8') : null;
      if (allHosts.includes('pi') && existingExtension !== null && !previous?.extension_versions?.includes(existingExtension)) {
        throw new Error(`Existing Pi extension is not owned by this installer: ${extension}`);
      }
      const files = bundleFiles();
      const bundleHash = digest(Buffer.concat(files.flatMap((file) => [Buffer.from(file.relative), Buffer.from('\0'), file.content])));
      const skillPath = path.join(local, 'runtime', bundleHash, 'skill');
      for (const file of files) {
        const destination = path.join(skillPath, file.relative);
        if (fs.existsSync(destination)) {
          if (!fs.readFileSync(destination).equals(file.content)) throw new Error(`Modified runtime bundle: ${destination}`);
        } else atomicWrite(destination, file.content, true);
      }
      fs.mkdirSync(root, { recursive: true });
      if (!fs.existsSync(path.join(local, '.gitignore'))) atomicWrite(path.join(local, '.gitignore'), '*\n', true);
      const node = process.execPath;
      const script = path.join(skillPath, 'scripts/ledger.mjs');
      const commandFor = (host) => [node, script, 'hook', '--workspace', workspace, '--host', host, '--scope-workspace'].map(shellQuote).join(' ');
      const commands = [...new Set([...(previous?.commands || []), ...hosts.filter((host) => host !== 'pi').map(commandFor)])];
      const piCode = `// Installed by conversation-ledger; configuration is in .conversation-ledger/runtime.json\nimport extension from ${JSON.stringify(path.join(skillPath, 'scripts/pi.mjs'))};\nexport default extension;\n`;
      const config = { version: 1, enabled: true, installation_id: previous?.installation_id || randomUUID(),
        hosts, managed_hosts: allHosts, node, skill_path: skillPath, commands, settings_files: settingsFiles,
        extension_versions: [...new Set([...(previous?.extension_versions || []), ...(hosts.includes('pi') ? [piCode] : [])])] };
      const backup = path.join(local, 'backups', randomUUID());
      for (const target of settingsFiles) {
        if (fs.existsSync(target)) atomicWrite(path.join(backup, `${digest(target)}.json`), fs.readFileSync(target));
      }
      if (existingExtension !== null) atomicWrite(path.join(backup, 'conversation-ledger.ts'), existingExtension);
      // Record ownership before installing hooks, so interrupted installations can be retried.
      atomicWrite(mappingFile, json({ version: 1, root }));
      atomicWrite(runtimeFile, json(config));
      for (const target of settingsFiles) {
        const data = stripOwned(settings[target], commands);
        const host = hosts.find((host) => settingsPaths[host] === target);
        if (host) {
          const events = host === 'codex'
            ? ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'Interrupt']
            : ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'StopFailure'];
          data.hooks ??= {};
          for (const event of events) {
            data.hooks[event] ??= [];
            data.hooks[event].push({ hooks: [{ type: 'command', command: commandFor(host), timeout: event === 'Interrupt' ? 3 : 10 }] });
          }
        }
        atomicWrite(target, json(data));
      }
      if (hosts.includes('pi')) atomicWrite(extension, piCode);
      else if (previous?.hosts.includes('pi') && existingExtension !== null) fs.unlinkSync(extension);
      return { installed: hosts, root, runtime: script, backup, settings_files: settingsFiles,
        next: ['Reload/restart the selected hosts.', ...(hosts.includes('codex') ? ['Codex requires project trust and review of the new definitions through /hooks.'] : []),
          'Check status after a real user turn; configured does not mean active.'] };
    });
  });
}

export function disable(workspace) {
  return withInstallLock(workspace, (local) => {
    const file = path.join(local, 'runtime.json');
    const config = readJSON(file);
    atomicWrite(file, json({ ...config, enabled: false }));
    return { enabled: false, retained: 'All captures and notes; existing callbacks now return without recording.' };
  });
}

export function uninstall(workspace) {
  workspace = fs.realpathSync(workspace);
  return withInstallLock(workspace, () => {
    const config = configFor(workspace);
    const settingsFiles = [...new Set([...(config.settings_files || []), path.join(workspace, '.codex/hooks.json'), path.join(workspace, '.claude/settings.local.json')])];
    return withSettingsLocks(settingsFiles, () => {
      const edits = [];
      for (const target of settingsFiles) {
        if (!fs.existsSync(target)) continue;
        const original = loadSettings(target);
        const updated = stripOwned(structuredClone(original), config.commands);
        if (json(original) !== json(updated)) edits.push({ target, updated });
      }
      atomicWrite(path.join(config.local, 'runtime.json'), json({ ...readJSON(path.join(config.local, 'runtime.json')), enabled: false }));
      for (const { target, updated } of edits) atomicWrite(target, json(updated));
      const extension = path.join(workspace, '.pi/extensions/conversation-ledger.ts');
      let modifiedPiPreserved = false;
      if (fs.existsSync(extension)) {
        if (config.extension_versions.includes(fs.readFileSync(extension, 'utf8'))) fs.unlinkSync(extension);
        else modifiedPiPreserved = true;
      }
      return { uninstalled: true, modified_pi_extension_preserved: modifiedPiPreserved,
        retained: 'Conversation data, runtime bundles, and backups. Unrelated or manually modified hooks are preserved.' };
    });
  });
}
