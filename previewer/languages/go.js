export const name = 'Go';

export function generate(analysis) {
  const lines = [];
  lines.push('<span class="cm">// Auto-generated Go equivalent of binary</span>');
  lines.push('<span class="cm">// Detected syscalls: ' + analysis.syscalls.map(s => s.name).join(', ') + '</span>');
  lines.push('');
  lines.push('<span class="kw">package</span> main');
  lines.push('');
  lines.push('<span class="kw">import</span> <span class="str">"fmt"</span>');

  const needsOs = analysis.syscalls.some(s => s.name === 'exit' && s.code !== 0);
  if (needsOs) {
    lines.pop();
    lines.push('<span class="kw">import</span> (');
    lines.push('    <span class="str">"fmt"</span>');
    lines.push('    <span class="str">"os"</span>');
    lines.push(')');
  }

  lines.push('');
  lines.push('<span class="kw">func</span> <span class="fn">main</span>() {');

  for (const sc of analysis.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      const data = sc.data;
      const hasNewline = data.endsWith('\n');
      const clean = hasNewline ? data.slice(0, -1) : data;
      if (hasNewline) {
        lines.push('    fmt.<span class="fn">Println</span>(<span class="str">"' + escapeStr(clean) + '"</span>)');
      } else {
        lines.push('    fmt.<span class="fn">Print</span>(<span class="str">"' + escapeStr(data) + '"</span>)');
      }
    } else if (sc.name === 'exit' && sc.code !== 0) {
      lines.push('    os.<span class="fn">Exit</span>(<span class="num">' + sc.code + '</span>)');
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function escapeStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
