// Claude Code PostToolUse hook: re-encode .ps1 (UTF-8 BOM) / .bat (Shift-JIS)
// after Write/Edit, per CLAUDE.md rule on Windows encoding.
const path = require('path');
const { spawnSync } = require('child_process');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; });
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(buf || '{}');
    const p = (j.tool_input && j.tool_input.file_path)
           || (j.tool_response && j.tool_response.filePath)
           || '';
    if (!/\.(ps1|bat)$/i.test(p)) return;
    spawnSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'encode-after-edit.ps1'),
      '-FilePath', p,
    ], { stdio: 'ignore' });
  } catch (_) {
    // Hook must never block; swallow errors.
  }
});
