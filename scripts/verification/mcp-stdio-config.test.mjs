import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Scribe MCP uses the configured native helper over stdio without HTTP credentials', async () => {
  const [mcpText, manifestText] = await Promise.all([
    read('plugins/scribe/.mcp.json'),
    read('plugins/scribe/.claude-plugin/plugin.json'),
  ]);
  const mcp = JSON.parse(mcpText).mcpServers.scribe;
  const manifest = JSON.parse(manifestText);

  assert.deepEqual(mcp, {
    type: 'stdio',
    command: '${user_config.client_path}',
    args: ['--mcp'],
    timeout: 610000,
  });
  assert.equal(manifest.version, '0.1.1');
  assert.deepEqual(Object.keys(manifest.userConfig), ['client_path']);
  assert.doesNotMatch(mcpText, /https?:|Authorization|Bearer|user_config\.(?:port|token)/i);
});

test('configuration script validates the independent helper key and configures only client_path', async () => {
  const source = await read('scripts/configure-claude-plugin.ps1');
  const configBlock = source.match(/\$configureValues = \[ordered\]@\{([\s\S]*?)\n    \} \| (?:Microsoft\.PowerShell\.Utility\\)?ConvertTo-Json/);
  assert.ok(configBlock, 'configuration JSON block is present');
  assert.match(source, /\[IO\.Path\]::Combine\(\$env:LOCALAPPDATA, 'Scribe\\scribe-hook\.exe'\)/);
  assert.match(source, /\$hookKeyProperty\.Value -notmatch '\^\[A-Za-z0-9_-\]\{32,128\}\$'/);
  assert.match(source, /\$tokenProperty\.Value -notmatch '\^\[A-Za-z0-9_-\]\{32,128\}\$'/);
  assert.match(source, /\$hookKeyProperty\.Value -ceq \$tokenProperty\.Value/);
  assert.match(source, /Update Scribe to a build with the MCP helper key/);
  assert.match(source, /\['mcp_transport'\]/);
  assert.match(source, /attested-stdio-v1/);
  assert.match(source, /WaitForExit\(3000\)/);
  assert.ok(source.indexOf('Test-ScribeMcpHelper -HelperPath') < source.indexOf("$script:Stage = 'marketplace list'"));
  assert.match(configBlock[1], /client_path\s*=\s*\$helperPath/);
  assert.doesNotMatch(configBlock[1], /\b(?:port|token|hook_key)\b/i);
  assert.doesNotMatch(source, /Invoke-WebRequest|Invoke-RestMethod|Authorization|Bearer/i);
});

test('English and Brazilian Portuguese setup instructions explain stdio migration', async () => {
  const [english, portuguese] = await Promise.all([read('README.md'), read('README.pt-BR.md')]);
  for (const readme of [english, portuguese]) {
    assert.match(readme, /stdio/);
    assert.match(readme, /userConfig/);
    assert.match(readme, /app\/helper/);
  }
  assert.match(english, /Any token saved by an older plugin configuration is\s+unused/);
  assert.match(portuguese, /Um token salvo por uma configuração antiga do\s+plugin deixa de ser usado/);
});

test('configuration guide supersedes the old token contract and labels HTTP probes as legacy', async () => {
  const [guide, adr, httpProbe, installerProbe] = await Promise.all([
    read('docs/configuracao-plugin-windows.md'),
    read('docs/adr/0006-configuration-plugin.md'),
    read('scripts/verification/mcp-probe.mjs'),
    read('scripts/verification/plugin-install.mjs'),
  ]);
  assert.match(guide, /A única opção enviada à CLI é `client_path`/);
  assert.match(guide, /mcp_transport: attested-stdio-v1/);
  assert.match(guide, /não que o app\s+desktop esteja aberto nem que uma chamada MCP funcione/);
  assert.match(guide, /a beta `0\.1\.0-beta\.1` usa/i);
  assert.doesNotMatch(guide, /envia\s+`client_path`, `port` e `token`/);
  assert.match(adr, /migração para MCP por stdio substitui o contrato/);
  assert.match(adr, /evidência abaixo é histórica/i);
  assert.match(httpProbe, /LEGACY:[\s\S]*incompatible with the Scribe stdio plugin/);
  assert.match(installerProbe, /LEGACY:[\s\S]*incompatible with the stdio plugin/);
});
