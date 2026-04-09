export const name = 'Java';

export function generate(analysis) {
  const lines = [];
  lines.push('<span class="cm">// Auto-generated Java equivalent of binary</span>');
  lines.push('<span class="cm">// Detected syscalls: ' + analysis.syscalls.map(s => s.name).join(', ') + '</span>');
  lines.push('');
  lines.push('<span class="kw">public class</span> <span class="type">Hello</span> {');
  lines.push('    <span class="kw">public static void</span> <span class="fn">main</span>(<span class="type">String</span>[] args) {');

  for (const sc of analysis.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      lines.push('        <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"' + escapeStr(sc.data) + '"</span>);');
    } else if (sc.name === 'exit') {
      lines.push('        <span class="type">System</span>.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }

  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

function escapeStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}
