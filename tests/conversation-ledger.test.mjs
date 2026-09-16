import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { acknowledge, capture, configFor, context, flush, handleHook, readJSON, review, status } from '../skills/conversation-ledger/scripts/core.mjs';
import { disable, install, uninstall } from '../skills/conversation-ledger/scripts/install.mjs';
import { registerPi } from '../skills/conversation-ledger/scripts/pi.mjs';
import { withSettingsLocks } from '../skills/conversation-ledger/scripts/workspace.mjs';

const cli = fileURLToPath(new URL('../skills/conversation-ledger/scripts/ledger.mjs', import.meta.url));
function fixture(t, hosts = ['codex', 'claude-code', 'pi']) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const result = install(workspace, hosts);
  return { workspace, root: result.root, result };
}
const prompt = (extra = {}) => ({ session_id: 'session-1', hook_event_name: 'UserPromptSubmit', prompt: 'Discuss A. Also preserve B for later.', ...extra });
function savedEvents(workspace) {
  const directory = path.join(workspace, '.conversation-ledger/events');
  return fs.readdirSync(directory).map((name) => readJSON(path.join(directory, name)));
}
function putJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); }

test('linked worktrees share discoverable Codex settings but capture only their own conversations', (t) => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-worktree-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const primary = path.join(parent, 'primary');
  const linked = path.join(primary, 'nested-worktree');
  fs.mkdirSync(primary);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', primary, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init');
  git('-c', 'user.name=Ledger Test', '-c', 'user.email=ledger@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  git('worktree', 'add', '-b', 'linked', linked);
  const settings = path.join(primary, '.codex/hooks.json');
  putJSON(settings, { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-owned' }] }] } });
  install(primary, ['codex']);
  install(linked, ['codex']);
  // Migrate an older installation that put owned hooks only in the linked checkout.
  const linkedSettings = path.join(linked, '.codex/hooks.json');
  const oldConfig = configFor(linked);
  putJSON(linkedSettings, { hooks: { Stop: [{ hooks: [{ type: 'command', command: oldConfig.commands[0] }] }] } });
  const runtimePath = path.join(linked, '.conversation-ledger/runtime.json');
  const legacy = readJSON(runtimePath);
  delete legacy.settings_files;
  putJSON(runtimePath, legacy);
  install(linked, ['codex']);
  assert.deepEqual(readJSON(linkedSettings), {});
  const commands = readJSON(settings).hooks.UserPromptSubmit.flatMap((group) => group.hooks.map((hook) => hook.command));
  assert.equal(commands.length, 2);
  assert.ok(configFor(linked).settings_files.includes(settings));
  for (const cwd of [primary, linked]) {
    for (const command of commands) {
      const result = spawnSync('/bin/sh', ['-c', command], { cwd, input: JSON.stringify(prompt({ cwd })), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).systemMessage, undefined);
    }
  }
  assert.equal(status(primary).captured, 1);
  assert.equal(status(linked).captured, 1);
  // A shared settings lock protects simultaneous installers from losing another worktree's hooks.
  const before = fs.readFileSync(settings, 'utf8');
  withSettingsLocks([settings], () => assert.throws(() => install(linked, ['codex']), /Another installation/));
  assert.equal(fs.readFileSync(settings, 'utf8'), before);
  uninstall(linked);
  assert.equal(readJSON(settings).hooks.UserPromptSubmit.length, 1);
  assert.equal(status(primary).enabled, true);
  uninstall(primary);
  assert.equal(readJSON(settings).hooks.Stop[0].hooks[0].command, 'echo user-owned');
});

test('native event replays are idempotent, equal unidentified prompts are separate occurrences', (t) => {
  const { workspace, root } = fixture(t);
  const first = capture(workspace, 'codex', prompt({ message_id: 'message-1', turn_id: 'turn-1' }));
  assert.equal(first.exported, true);
  assert.equal(capture(workspace, 'codex', prompt({ message_id: 'message-1', turn_id: 'turn-1' })).duplicate, true);
  capture(workspace, 'claude-code', prompt());
  capture(workspace, 'claude-code', prompt());
  assert.equal(status(workspace).captured, 3);
  assert.throws(() => capture(workspace, 'codex', prompt({ message_id: 'message-1', turn_id: 'turn-1', prompt: 'Different content' })), /collision/);
  const source = savedEvents(workspace).find((event) => event.id === first.id);
  const text = fs.readFileSync(path.join(root, 'Sessions', source.session, `${source.id}.md`), 'utf8');
  assert.match(text, /> Discuss A\. Also preserve B for later\./);
});

test('offline roots retain captures; replay exports without overwriting user edits', (t) => {
  const { workspace, root } = fixture(t);
  fs.rmdirSync(root);
  assert.equal(capture(workspace, 'codex', prompt()).exported, false);
  assert.equal(status(workspace).pending_export, 1);
  assert.equal(fs.existsSync(root), false);
  assert.throws(() => review(workspace), /unavailable/);
  fs.mkdirSync(root);
  assert.equal(flush(workspace).created, 1);
  const event = savedEvents(workspace)[0];
  const file = path.join(root, 'Sessions', event.session, `${event.id}.md`);
  fs.appendFileSync(file, '\nUser annotation: preserve this.\n');
  assert.equal(flush(workspace).preserved_modified_sources.length, 1);
  assert.match(fs.readFileSync(file, 'utf8'), /User annotation/);
  assert.equal(review(workspace).sources[0].source_modified, true);
  assert.equal(status(workspace).pending_export, 0);
});

test('multiple inputs within the same turn retain separate receipts', (t) => {
  const { workspace } = fixture(t);
  capture(workspace, 'codex', prompt({ turn_id: 'same-turn' }));
  capture(workspace, 'codex', prompt({ turn_id: 'same-turn', prompt: 'Correction: focus on B.' }));
  capture(workspace, 'codex', prompt({ turn_id: 'same-turn' }));
  assert.equal(status(workspace).captured, 3);
  assert.equal(new Set(savedEvents(workspace).map((event) => event.id)).size, 3);
});

test('review acknowledgement requires a saved receipt and never covers later arrivals', (t) => {
  const { workspace, root } = fixture(t);
  capture(workspace, 'codex', prompt());
  const batch = review(workspace);
  capture(workspace, 'codex', prompt({ prompt: 'A new question after the snapshot.' }));
  const receipt = path.join(root, 'Sessions/review.md');
  fs.writeFileSync(receipt, 'No evidence IDs yet.');
  assert.throws(() => acknowledge(workspace, batch.id, 'Sessions/review.md'), /missing event/);
  assert.throws(() => acknowledge(workspace, batch.id, batch.sources[0].path), /not a review receipt/);
  fs.writeFileSync(receipt, `# Review\n${batch.events[0]}: retained A and B in question notes.\n`);
  acknowledge(workspace, batch.id, 'Sessions/review.md');
  acknowledge(workspace, batch.id, 'Sessions/review.md');
  assert.equal(status(workspace).pending_review, 1);
  assert.equal(review(workspace).sources[0].text, 'A new question after the snapshot.');
  fs.writeFileSync(path.join(workspace, 'outside.md'), batch.events.join('\n'));
  fs.symlinkSync(path.join(workspace, 'outside.md'), path.join(root, 'escaped.md'));
  assert.throws(() => acknowledge(workspace, batch.id, 'escaped.md'), /inside the ledger/);
});

test('install and uninstall preserve unrelated settings and do not duplicate owned hooks', (t) => {
  const { workspace } = fixture(t);
  const settingsFile = path.join(workspace, '.claude/settings.local.json');
  const settings = readJSON(settingsFile);
  settings.permissions = { allow: ['Read'] };
  settings.hooks.Stop[0].hooks.push({ type: 'command', command: 'echo user-owned' });
  putJSON(settingsFile, settings);
  install(workspace);
  install(workspace);
  let actual = readJSON(settingsFile);
  const handlers = actual.hooks.Stop.flatMap((group) => group.hooks);
  assert.equal(handlers.filter((hook) => hook.command.includes('ledger.mjs')).length, 1);
  assert.equal(handlers.filter((hook) => hook.command === 'echo user-owned').length, 1);
  capture(workspace, 'codex', prompt());
  uninstall(workspace);
  actual = readJSON(settingsFile);
  assert.deepEqual(actual.permissions, { allow: ['Read'] });
  assert.equal(actual.hooks.Stop.flatMap((group) => group.hooks).length, 1);
  assert.equal(actual.hooks.Stop[0].hooks[0].command, 'echo user-owned');
  assert.equal(status(workspace).captured, 1);
  assert.equal(status(workspace).enabled, false);
  assert.equal(fs.existsSync(path.join(workspace, '.pi/extensions/conversation-ledger.ts')), false);
  assert.deepEqual(handleHook(workspace, 'codex', prompt()), {});
});

test('malformed settings abort before any host configuration changes', (t) => {
  const { workspace } = fixture(t);
  const codexFile = path.join(workspace, '.codex/hooks.json');
  const before = fs.readFileSync(codexFile, 'utf8');
  fs.writeFileSync(path.join(workspace, '.claude/settings.local.json'), '{broken');
  assert.throws(() => install(workspace), SyntaxError);
  assert.equal(fs.readFileSync(codexFile, 'utf8'), before);
});

test('an unrelated Pi extension does not prevent a Codex-only install', (t) => {
  const { workspace } = fixture(t, ['codex']);
  const extension = path.join(workspace, '.pi/extensions/conversation-ledger.ts');
  fs.mkdirSync(path.dirname(extension), { recursive: true });
  fs.writeFileSync(extension, 'user code');
  install(workspace, ['codex']);
  assert.throws(() => install(workspace, ['pi']), /not owned/);
  assert.equal(fs.readFileSync(extension, 'utf8'), 'user code');
});

test('Stop, interruptions and failures never request another model turn', (t) => {
  const { workspace } = fixture(t);
  for (const [host, kind] of [['codex', 'Stop'], ['codex', 'Interrupt'], ['claude-code', 'StopFailure']]) {
    const result = handleHook(workspace, host, { session_id: 's', hook_event_name: kind, last_assistant_message: 'Done' });
    assert.deepEqual(result, {});
  }
  const injected = handleHook(workspace, 'codex', prompt());
  assert.match(injected.hookSpecificOutput.additionalContext, /Pending review: 4/);
  assert.equal(injected.decision, undefined);
  disable(workspace);
  assert.equal(context(workspace), '');
  assert.deepEqual(handleHook(workspace, 'codex', prompt()), {});
  assert.equal(status(workspace).captured, 4);
});

test('installed command quotes paths, runs from a subdirectory, and preserves full text', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-shell-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const workspace = path.join(parent, "space ' $(touch INJECTION) `touch OTHER`");
  fs.mkdirSync(workspace);
  install(workspace, ['codex']);
  const cmd = readJSON(path.join(workspace, '.codex/hooks.json')).hooks.UserPromptSubmit[0].hooks[0].command;
  const subdirectory = path.join(workspace, 'nested');
  fs.mkdirSync(subdirectory);
  const input = prompt({ prompt: 'a'.repeat(4000) });
  const result = spawnSync('/bin/sh', ['-c', cmd], { cwd: subdirectory, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).hookSpecificOutput);
  assert.equal(fs.existsSync(path.join(subdirectory, 'INJECTION')), false);
  assert.equal(fs.existsSync(path.join(subdirectory, 'OTHER')), false);
  const batch = review(workspace);
  assert.equal(batch.sources[0].text_truncated, true);
  assert.equal(batch.sources[0].text.length, 2000);
  assert.equal(savedEvents(workspace)[0].text.length, 4000);
});

test('parallel capture processes retain independent events and native duplicate identity', async (t) => {
  const { workspace } = fixture(t);
  const jobs = Array.from({ length: 12 }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'hook', '--workspace', workspace, '--host', 'codex']);
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      try { assert.equal(code, 0); assert.equal(JSON.parse(stdout).systemMessage, undefined); resolve(); }
      catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(prompt({ message_id: `message-${i % 6}`, turn_id: 'shared-turn' })));
  }));
  await Promise.all(jobs);
  assert.equal(status(workspace).captured, 6);
  assert.equal(status(workspace).pending_export, 0);
});

test('Pi adapter records text and branch changes, skips tool/reasoning/custom context, and respects disable', (t) => {
  const { workspace } = fixture(t, ['pi']);
  const handlers = {};
  registerPi({ on: (name, handler) => { handlers[name] = handler; } }, workspace);
  const ctx = { hasUI: false, sessionManager: { getSessionId: () => 'pi-session', getLeafId: () => 'branch-1' } };
  handlers.session_start({}, ctx);
  handlers.message_end({ message: { role: 'assistant', content: [
    { type: 'thinking', thinking: 'not exported' }, { type: 'text', text: 'A useful conclusion.' },
    { type: 'toolCall', name: 'bash' },
  ], stopReason: 'stop' } }, ctx);
  handlers.message_end({ message: { role: 'toolResult', content: [] } }, ctx);
  handlers.message_end({ message: { role: 'custom', content: 'ledger injection' } }, ctx);
  handlers.session_tree({ newLeafId: 'branch-2' }, ctx);
  handlers.agent_settled({}, ctx);
  assert.equal(status(workspace).captured, 4);
  assert.equal(savedEvents(workspace).find((event) => event.role === 'assistant').text, 'A useful conclusion.');
  assert.match(handlers.before_agent_start({}, ctx).message.content, /Pending review: 4/);
  disable(workspace);
  assert.equal(handlers.before_agent_start({}, ctx), undefined);
  handlers.agent_settled({}, ctx);
  assert.equal(status(workspace).captured, 4);
});

test('CLI reports capture failures without claiming success or blocking Stop', (t) => {
  const { workspace } = fixture(t);
  const result = spawnSync(process.execPath, [cli, 'hook', '--workspace', workspace, '--host', 'codex'], {
    input: JSON.stringify({ hook_event_name: 'Stop' }), encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).systemMessage, /Missing session_id/);
  assert.equal(status(workspace).captured, 0);
});

test('corrupt spool paths are rejected before export', (t) => {
  const { workspace } = fixture(t);
  const { id } = capture(workspace, 'codex', prompt());
  const file = path.join(workspace, '.conversation-ledger/events', `${id}.json`);
  const event = readJSON(file);
  event.session = '../../outside';
  putJSON(file, event);
  assert.throws(() => flush(workspace), /Invalid event record/);
  assert.equal(fs.existsSync(path.join(workspace, 'outside')), false);
});
