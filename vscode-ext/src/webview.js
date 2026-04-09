/**
 * Generates the webview HTML for the bin2prev VS Code panel.
 */

function getWebviewContent(fileName, fileSize, analysis) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/'/g, "\\'");
  const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Pre-generate all language previews
  const langs = {
    Java: generateJava(analysis),
    JavaScript: generateJS(analysis),
    Python: generatePython(analysis),
    Ruby: generateRuby(analysis),
    Go: generateGo(analysis),
    'Raw Binary': generateRaw(analysis)
  };

  const langsJSON = JSON.stringify(langs);
  const formatSize = fileSize < 1024 ? fileSize + ' B' :
    fileSize < 1048576 ? (fileSize / 1024).toFixed(1) + ' KB' :
    (fileSize / 1048576).toFixed(1) + ' MB';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family, -apple-system, sans-serif);
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-editor-foreground, #d4d4d4);
  padding: 0;
}
.file-info {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: var(--vscode-titleBar-activeBackground, #333);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 13px;
}
.file-name { font-weight: 600; color: var(--vscode-textLink-foreground, #3794ff); }
.file-meta { color: var(--vscode-descriptionForeground, #888); font-size: 12px; }
.format-badge {
  background: var(--vscode-badge-background, #444);
  color: var(--vscode-badge-foreground, #fff);
  padding: 2px 8px; border-radius: 3px; font-size: 11px;
}
.tabs {
  display: flex; gap: 0;
  background: var(--vscode-tab-inactiveBackground, #2d2d2d);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  overflow-x: auto;
}
.tab {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--vscode-tab-inactiveForeground, #888);
  font-size: 13px; font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.tab:hover {
  color: var(--vscode-tab-activeForeground, #fff);
  background: var(--vscode-tab-hoverBackground, #383838);
}
.tab.active {
  color: var(--vscode-tab-activeForeground, #fff);
  border-bottom-color: var(--vscode-focusBorder, #007acc);
  background: var(--vscode-editor-background, #1e1e1e);
}
.code-wrap { position: relative; }
.copy-btn {
  position: absolute; top: 8px; right: 12px;
  background: var(--vscode-button-secondaryBackground, #333);
  color: var(--vscode-button-secondaryForeground, #ccc);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 4px 10px; border-radius: 4px;
  font-size: 12px; cursor: pointer; z-index: 1;
}
.copy-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground, #444);
  color: var(--vscode-button-foreground, #fff);
}
.copy-btn.copied { color: #3fb950; border-color: #3fb950; }
pre {
  padding: 16px; padding-right: 80px;
  overflow: auto; max-height: calc(100vh - 90px);
  font-family: var(--vscode-editor-fontFamily, 'Cascadia Code', Consolas, monospace);
  font-size: var(--vscode-editor-fontSize, 13px);
  line-height: 1.6;
}
code { white-space: pre; }
.kw { color: #c586c0; }
.str { color: #ce9178; }
.fn { color: #dcdcaa; }
.cm { color: #6a9955; }
.num { color: #b5cea8; }
.type { color: #4ec9b0; }
</style>
</head>
<body>
  <div class="file-info">
    <span class="file-name">${escHtml(fileName)}</span>
    <span class="file-meta">${formatSize}</span>
    <span class="format-badge">${escHtml(analysis.format.name)}</span>
  </div>
  <div class="tabs" id="tabs"></div>
  <div class="code-wrap">
    <button class="copy-btn" id="copy-btn">📋 Copy</button>
    <pre><code id="output"></code></pre>
  </div>
  <script>
    const langs = ${langsJSON};
    const names = Object.keys(langs);
    const tabsEl = document.getElementById('tabs');
    const output = document.getElementById('output');
    const copyBtn = document.getElementById('copy-btn');
    let active = 0;

    names.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (i === 0 ? ' active' : '');
      btn.textContent = name;
      btn.onclick = () => show(i);
      tabsEl.appendChild(btn);
    });

    function show(i) {
      active = i;
      tabsEl.querySelectorAll('.tab').forEach((t, j) => t.classList.toggle('active', j === i));
      output.innerHTML = langs[names[i]];
    }

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(output.textContent).then(() => {
        copyBtn.textContent = '✅ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; copyBtn.classList.remove('copied'); }, 2000);
      });
    };

    show(0);
  </script>
</body>
</html>`;
}

// --- Language generators ---

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function generateJava(a) {
  const l = [];
  l.push('<span class="cm">// Binary → Java equivalent</span>');
  l.push('<span class="cm">// Detected syscalls: ' + a.syscalls.map(s => s.name).join(', ') + '</span>');
  l.push('');
  l.push('<span class="kw">public class</span> <span class="type">Hello</span> {');
  l.push('    <span class="kw">public static void</span> <span class="fn">main</span>(<span class="type">String</span>[] args) {');
  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      l.push('        <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"' + esc(sc.data) + '"</span>);');
    } else if (sc.name === 'read') {
      l.push('        <span class="type">java.util.Scanner</span> scanner = <span class="kw">new</span> <span class="type">java.util.Scanner</span>(<span class="type">System</span>.in);');
      l.push('        <span class="type">String</span> input = scanner.<span class="fn">nextLine</span>();');
    } else if (sc.name === 'exit') {
      l.push('        <span class="type">System</span>.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }
  l.push('    }');
  l.push('}');
  return l.join('\n');
}

function generateJS(a) {
  const l = [];
  l.push('<span class="cm">// Binary → JavaScript equivalent</span>');
  l.push('');
  const needsReadline = a.syscalls.some(s => s.name === 'read');
  if (needsReadline) {
    l.push('<span class="kw">const</span> readline = <span class="fn">require</span>(<span class="str">"readline"</span>);');
    l.push('<span class="kw">const</span> rl = readline.<span class="fn">createInterface</span>({ input: process.stdin, output: process.stdout });');
    l.push('');
  }
  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.data.endsWith('\n'))
        l.push('<span class="fn">console</span>.<span class="fn">log</span>(<span class="str">"' + esc(sc.data.slice(0, -1)) + '"</span>);');
      else
        l.push('<span class="fn">process</span>.stdout.<span class="fn">write</span>(<span class="str">"' + esc(sc.data) + '"</span>);');
    } else if (sc.name === 'read') {
      l.push('rl.<span class="fn">question</span>(<span class="str">""</span>, (answer) =&gt; {');
      l.push('    <span class="fn">console</span>.<span class="fn">log</span>(answer);');
      l.push('});');
    } else if (sc.name === 'exit') {
      l.push('<span class="fn">process</span>.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }
  return l.join('\n');
}

function generatePython(a) {
  const l = [];
  l.push('<span class="cm"># Binary → Python equivalent</span>');
  l.push('');
  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.data.endsWith('\n'))
        l.push('<span class="fn">print</span>(<span class="str">"' + esc(sc.data.slice(0, -1)) + '"</span>)');
      else
        l.push('<span class="fn">print</span>(<span class="str">"' + esc(sc.data) + '"</span>, end=<span class="str">""</span>)');
    } else if (sc.name === 'read') {
      l.push('name = <span class="fn">input</span>()');
    } else if (sc.name === 'exit' && sc.code !== 0) {
      l.push('<span class="kw">import</span> sys');
      l.push('sys.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>)');
    }
  }
  return l.join('\n');
}

function generateRuby(a) {
  const l = [];
  l.push('<span class="cm"># Binary → Ruby equivalent</span>');
  l.push('');
  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.data.endsWith('\n'))
        l.push('<span class="fn">puts</span> <span class="str">"' + esc(sc.data.slice(0, -1)) + '"</span>');
      else
        l.push('<span class="fn">print</span> <span class="str">"' + esc(sc.data) + '"</span>');
    } else if (sc.name === 'read') {
      l.push('name = <span class="fn">gets</span>.<span class="fn">chomp</span>');
    } else if (sc.name === 'exit') {
      l.push('<span class="fn">exit</span> <span class="num">' + sc.code + '</span>');
    }
  }
  return l.join('\n');
}

function generateGo(a) {
  const l = [];
  l.push('<span class="cm">// Binary → Go equivalent</span>');
  l.push('');
  l.push('<span class="kw">package</span> main');
  l.push('');
  const needsBufio = a.syscalls.some(s => s.name === 'read');
  const needsOs = a.syscalls.some(s => (s.name === 'exit' && s.code !== 0) || s.name === 'read');
  const imports = ['"fmt"'];
  if (needsBufio) imports.push('"bufio"');
  if (needsOs) imports.push('"os"');
  if (imports.length === 1) {
    l.push('<span class="kw">import</span> <span class="str">' + imports[0] + '</span>');
  } else {
    l.push('<span class="kw">import</span> (');
    for (const imp of imports) l.push('    <span class="str">' + imp + '</span>');
    l.push(')');
  }
  l.push('');
  l.push('<span class="kw">func</span> <span class="fn">main</span>() {');
  if (needsBufio) {
    l.push('    reader := bufio.<span class="fn">NewReader</span>(os.Stdin)');
  }
  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.data.endsWith('\n'))
        l.push('    fmt.<span class="fn">Println</span>(<span class="str">"' + esc(sc.data.slice(0, -1)) + '"</span>)');
      else
        l.push('    fmt.<span class="fn">Print</span>(<span class="str">"' + esc(sc.data) + '"</span>)');
    } else if (sc.name === 'read') {
      l.push('    name, _ := reader.<span class="fn">ReadString</span>(<span class="str">\'\\n\'</span>)');
      l.push('    _ = name');
    } else if (sc.name === 'exit' && sc.code !== 0) {
      l.push('    os.<span class="fn">Exit</span>(<span class="num">' + sc.code + '</span>)');
    }
  }
  l.push('}');
  return l.join('\n');
}

function generateRaw(a) {
  const bytes = a.rawBytes || [];
  const l = [];
  l.push('<span class="cm">// Raw binary — hex dump with ASCII</span>');
  l.push('<span class="cm">// Offset    00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F  |ASCII           |</span>');
  l.push('');
  for (let i = 0; i < bytes.length; i += 16) {
    const off = '<span class="num">' + i.toString(16).padStart(8, '0') + '</span>';
    let h1 = '', h2 = '', ascii = '';
    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        const b = bytes[i + j];
        const h = b.toString(16).padStart(2, '0');
        const sp = b === 0 ? '<span class="cm">' + h + '</span>' : '<span class="str">' + h + '</span>';
        if (j < 8) h1 += sp + ' '; else h2 += sp + ' ';
        ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<span class="cm">.</span>';
      } else {
        if (j < 8) h1 += '   '; else h2 += '   ';
        ascii += ' ';
      }
    }
    l.push(off + '  ' + h1 + ' ' + h2 + ' <span class="cm">|</span>' + ascii + '<span class="cm">|</span>');
  }
  return l.join('\n');
}

module.exports = { getWebviewContent };
