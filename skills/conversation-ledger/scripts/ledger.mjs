#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { acknowledge, context, flush, handleHook, json, review, status } from './core.mjs';
import { disable, install, uninstall } from './install.mjs';
import { matchesWorkspace } from './workspace.mjs';

const help = `Conversation Ledger runtime (Node.js 22+, macOS/Linux installer)

  node ledger.mjs install --workspace <project> --agents codex,claude-code,pi [--root <ledger>]
  node ledger.mjs status --workspace <project>
  node ledger.mjs review --workspace <project> [--limit 20]
  node ledger.mjs ack --workspace <project> --batch B-... --note Sessions/review.md
  node ledger.mjs flush --workspace <project>
  node ledger.mjs disable --workspace <project>
  node ledger.mjs uninstall --workspace <project>

Internal hook entry: hook --workspace <project> --host codex|claude-code, JSON on stdin.
Installation enables capture and next-turn checkpoint guidance, not an independent model observer.
`;

let command;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    workspace: { type: 'string' }, agents: { type: 'string' }, root: { type: 'string' },
    host: { type: 'string' }, limit: { type: 'string' }, batch: { type: 'string' },
    note: { type: 'string' }, help: { type: 'boolean' }, 'scope-workspace': { type: 'boolean' },
  } });
  command = positionals[0];
  if (values.help || !command) { process.stdout.write(help); }
  else {
    if (positionals.length !== 1) throw new Error('Unexpected positional arguments');
    const workspace = path.resolve(values.workspace || process.cwd());
    let result;
    switch (command) {
      case 'install': result = install(workspace, values.agents?.split(','), values.root); break;
      case 'disable': result = disable(workspace); break;
      case 'uninstall': result = uninstall(workspace); break;
      case 'status': result = status(workspace); break;
      case 'flush': result = flush(workspace); break;
      case 'review': result = review(workspace, values.limit === undefined ? 20 : Number(values.limit)); break;
      case 'ack': result = acknowledge(workspace, values.batch, values.note); break;
      case 'context': result = { context: context(workspace) }; break;
      case 'hook': {
        const chunks = [];
        let size = 0;
        for await (const chunk of process.stdin) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) throw new Error('Hook payload exceeds 2 MiB; event was not saved');
          chunks.push(chunk);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        result = values['scope-workspace'] && !matchesWorkspace(workspace, payload.cwd ?? process.cwd())
          ? {} : handleHook(workspace, values.host, payload);
        break;
      }
      default: throw new Error(`Unknown command: ${command}`);
    }
    process.stdout.write(json(result));
  }
} catch (error) {
  const message = `Conversation Ledger: ${error.message}`;
  if (command === 'hook') {
    // Valid non-blocking hook output; never interfere with user completion or interruption.
    process.stdout.write(json({ systemMessage: message }));
  } else { process.stderr.write(`${message}\n`); process.exitCode = 1; }
}
