export const name = 'JavaScript';

export function generate(analysis) {
  const lines = [];
  lines.push('<span class="cm">// Auto-generated JavaScript equivalent of binary</span>');
  lines.push('<span class="cm">// Detected syscalls: ' + analysis.syscalls.map(s => s.name).join(', ') + '</span>');
  lines.push('');

  for (const sc of analysis.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      const data = sc.data;
      const hasNewline = data.endsWith('\n');
      const clean = hasNewline ? data.slice(0, -1) : data;
      const fn = hasNewline ? 'log' : 'write';
      if (hasNewline) {
        lines.push('<span class="fn">console</span>.<span class="fn">log</span>(<span class="str">"' + escapeStr(clean) + '"</span>);');
      } else {
        lines.push('<span class="fn">process</span>.stdout.<span class="fn">write</span>(<span class="str">"' + escapeStr(data) + '"</span>);');
      }
    } else if (sc.name === 'exit') {
      lines.push('<span class="fn">process</span>.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }

  return lines.join('\n');
}

function escapeStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
