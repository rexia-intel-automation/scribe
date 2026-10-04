import { request } from 'node:http';

// Phase 0 observer only. It never forwards a permission decision or prints errors.
// URL and bearer token come from the isolated probe, not user settings.
try {
  const url = new URL(process.argv[2]);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !process.env.SCRIBE_PROBE_TOKEN) process.exit(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) process.exit(0);
    chunks.push(chunk);
  }
  const payload = Buffer.concat(chunks);
  const parsed = JSON.parse(payload.toString('utf8'));
  if (url.pathname !== `/v1/hooks/${parsed.hook_event_name}`) process.exit(0);
  await new Promise((done) => {
    const req = request(url, { method: 'POST', headers: {
      Authorization: `Bearer ${process.env.SCRIBE_PROBE_TOKEN}`,
      'Content-Type': 'application/json', 'Content-Length': payload.length,
    } }, (res) => { res.resume(); res.once('end', done); res.once('error', done); });
    // A wall-clock deadline also covers partial or endlessly streamed replies.
    const timer = setTimeout(() => { req.destroy(); done(); }, 250);
    req.once('error', done);
    req.once('close', () => { clearTimeout(timer); done(); });
    req.end(payload);
  });
} catch {
  // Observer failure must not change the Claude permission flow.
}
