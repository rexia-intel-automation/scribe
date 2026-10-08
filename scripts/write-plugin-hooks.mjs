import { writeFile } from 'node:fs/promises';
import { EVENTS } from './verification/lib.mjs';

// Keep exec form on every platform: no shell and no token in process arguments.
const commandHook = (event, timeout) => ({
  type: 'command', command: '${user_config.client_path}', args: ['--hook', event], timeout,
});
const hooks = Object.fromEntries(EVENTS.map(event => [event,
  event === 'PreToolUse'
    ? [
        { matcher: '^(AskUserQuestion|ExitPlanMode)$', hooks: [commandHook(event, 130)] },
        { matcher: '^(?!(AskUserQuestion|ExitPlanMode)$).*', hooks: [commandHook(event, 1)] },
      ]
    : [{ hooks: [commandHook(event, event === 'PermissionRequest' ? 130 : 1)] }],
]));
await writeFile(new URL('../plugins/scribe/hooks/hooks.json', import.meta.url),
  JSON.stringify({ hooks }, null, 2) + '\n');
