/**
 * Generates the webview HTML for the bin2prev VS Code panel.
 *
 * Design principles:
 *  - Works for ANY binary, not just the example files.
 *  - Each language generator adapts to whatever the analyzer found:
 *      · sc.pattern === 'pyramid'  → idiomatic loop code
 *      · write syscall             → print / println equivalent
 *      · read syscall              → stdin-reading equivalent
 *      · exit syscall              → process-exit equivalent
 *  - The host OS (Windows / macOS / Linux) has zero effect on the output;
 *    the preview is determined entirely by the binary's own content.
 */

function getWebviewContent(fileName, fileSize, analysis) {
  const escHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Tab order: Go first (most requested), then other languages, hex dump last
  const langs = {
    Go:           generateGo(analysis),
    Python:       generatePython(analysis),
    JavaScript:   generateJS(analysis),
    Java:         generateJava(analysis),
    Ruby:         generateRuby(analysis),
    'Hex Dump':   generateRaw(analysis),
  };

  const langsJSON    = JSON.stringify(langs);
  const patternBadge = getPatternBadge(analysis);
  const formatSize   = fileSize < 1024        ? fileSize + ' B'
                     : fileSize < 1_048_576   ? (fileSize / 1024).toFixed(1) + ' KB'
                     :                          (fileSize / 1_048_576).toFixed(1) + ' MB';

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
}
/* ── info bar ── */
.info-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 16px;
  background: var(--vscode-titleBar-activeBackground, #2d2d2d);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
  font-size: 12px;
}
.file-name {
  font-weight: 600; font-size: 13px;
  color: var(--vscode-textLink-foreground, #3794ff);
}
.badge {
  padding: 2px 8px; border-radius: 3px; font-size: 11px;
  background: var(--vscode-badge-background, #3c3c3c);
  color: var(--vscode-badge-foreground, #ccc);
  white-space: nowrap;
}
.badge-pattern {
  background: #0d3318; color: #4ec94e;
  border: 1px solid #1e5c2e;
}
/* ── language tabs ── */
.lang-bar {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 8px 16px;
  background: var(--vscode-sideBar-background, #252526);
  border-bottom: 1px solid var(--vscode-panel-border, #444);
}
.lang-label {
  font-size: 11px; color: var(--vscode-descriptionForeground, #888);
  margin-right: 4px; white-space: nowrap;
}
.tab {
  padding: 5px 14px; border-radius: 4px;
  background: transparent;
  border: 1px solid var(--vscode-panel-border, #3c3c3c);
  color: var(--vscode-tab-inactiveForeground, #999);
  font-size: 12px; font-family: inherit;
  cursor: pointer; white-space: nowrap;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.tab:hover {
  background: var(--vscode-tab-hoverBackground, #2a2d2e);
  color: var(--vscode-editor-foreground, #d4d4d4);
}
.tab.active {
  background: var(--vscode-button-background, #0e639c);
  border-color: var(--vscode-button-background, #0e639c);
  color: #fff; font-weight: 600;
}
/* ── code panel ── */
.code-wrap { position: relative; }
.copy-btn {
  position: absolute; top: 10px; right: 14px; z-index: 1;
  background: var(--vscode-button-secondaryBackground, #313131);
  color: var(--vscode-button-secondaryForeground, #ccc);
  border: 1px solid var(--vscode-panel-border, #555);
  padding: 4px 12px; border-radius: 4px;
  font-size: 11px; cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.copy-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #3c3c3c); color: #fff; }
.copy-btn.copied { color: #4ec94e; border-color: #4ec94e; }
pre {
  padding: 16px; padding-right: 90px;
  overflow: auto; max-height: calc(100vh - 100px);
  font-family: var(--vscode-editor-fontFamily, 'Cascadia Code', Consolas, monospace);
  font-size: var(--vscode-editor-fontSize, 13px);
  line-height: 1.65;
}
code { white-space: pre; }
/* syntax colours — VS Code dark theme palette */
.kw  { color: #c586c0; }   /* keywords   */
.str { color: #ce9178; }   /* strings    */
.fn  { color: #dcdcaa; }   /* functions  */
.cm  { color: #6a9955; }   /* comments   */
.num { color: #b5cea8; }   /* numbers    */
.type{ color: #4ec9b0; }   /* types      */
.op  { color: #d4d4d4; }   /* operators  */
</style>
</head>
<body>

<div class="info-bar">
  <span class="file-name">${escHtml(fileName)}</span>
  <span class="badge">${escHtml(formatSize)}</span>
  <span class="badge">${escHtml(analysis.format.name)}</span>
  ${patternBadge ? `<span class="badge badge-pattern">${escHtml(patternBadge)}</span>` : ''}
</div>

<div class="lang-bar">
  <span class="lang-label">Preview as:</span>
  <div id="tabs" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
</div>

<div class="code-wrap">
  <button class="copy-btn" id="copy-btn">Copy</button>
  <pre><code id="output"></code></pre>
</div>

<script>
  const langs   = ${langsJSON};
  const names   = Object.keys(langs);
  const tabsEl  = document.getElementById('tabs');
  const output  = document.getElementById('output');
  const copyBtn = document.getElementById('copy-btn');

  names.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === 0 ? ' active' : '');
    btn.textContent = name;
    btn.onclick = () => show(i);
    tabsEl.appendChild(btn);
  });

  function show(i) {
    tabsEl.querySelectorAll('.tab').forEach((t, j) => t.classList.toggle('active', j === i));
    output.innerHTML = langs[names[i]];
  }

  copyBtn.onclick = () => {
    navigator.clipboard.writeText(output.textContent).then(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
    });
  };

  show(0);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Pattern badge — summarises what the analyzer found, shown in the info bar
// ---------------------------------------------------------------------------

function getPatternBadge(analysis) {
  for (const sc of analysis.syscalls) {
    if (sc.pattern === 'custompyramid') return 'Custom Pyramid · 1–100 rows';
    if (sc.pattern === 'pyramid') return `Pyramid · ${sc.rows} rows`;
  }
  if (analysis.syscalls.some(s => s.name === 'read'))  return 'Interactive program';
  if (analysis.syscalls.some(s => s.name === 'write')) return 'Print program';
  return '';
}

// ---------------------------------------------------------------------------
// Shared string-escape helper (for embedding data in generated source code)
// ---------------------------------------------------------------------------

function escStr(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g,  '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

// ---------------------------------------------------------------------------
// Language generators
//
// Each generator loops over analysis.syscalls and emits idiomatic code.
// The key branch is sc.pattern === 'pyramid', which emits a proper loop
// rather than a raw print of the literal string.
// ---------------------------------------------------------------------------

// ── Go ──────────────────────────────────────────────────────────────────────

function generateGo(a) {
  const l = [];

  // Custom pyramid: reads N from stdin, prints N-row pyramid
  if (a.syscalls.some(sc => sc.pattern === 'custompyramid')) {
    l.push('<span class="kw">package</span> main');
    l.push('');
    l.push('<span class="kw">import</span> (');
    l.push('\t<span class="str">"bufio"</span>');
    l.push('\t<span class="str">"fmt"</span>');
    l.push('\t<span class="str">"os"</span>');
    l.push('\t<span class="str">"strconv"</span>');
    l.push('\t<span class="str">"strings"</span>');
    l.push(')');
    l.push('');
    l.push('<span class="kw">func</span> <span class="fn">main</span>() {');
    l.push('\treader <span class="op">:=</span> bufio.<span class="fn">NewReader</span>(os.Stdin)');
    l.push('\tfmt.<span class="fn">Print</span>(<span class="str">"Rows (1-100): "</span>)');
    l.push('\tinput, _ <span class="op">:=</span> reader.<span class="fn">ReadString</span>(<span class="str">\'\\n\'</span>)');
    l.push('\tn, _ <span class="op">:=</span> strconv.<span class="fn">Atoi</span>(strings.<span class="fn">TrimSpace</span>(input))');
    l.push('\t<span class="kw">if</span> n <span class="op">&lt;</span> <span class="num">1</span>   { n <span class="op">=</span> <span class="num">1</span> }');
    l.push('\t<span class="kw">if</span> n <span class="op">&gt;</span> <span class="num">100</span> { n <span class="op">=</span> <span class="num">100</span> }');
    l.push('');
    l.push('\t<span class="kw">for</span> i <span class="op">:=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> n; i<span class="op">++</span> {');
    l.push('\t\t<span class="kw">for</span> j <span class="op">:=</span> <span class="num">1</span>; j <span class="op">&lt;=</span> n<span class="op">-</span>i; j<span class="op">++</span> { fmt.<span class="fn">Print</span>(<span class="str">" "</span>) }');
    l.push('\t\t<span class="kw">for</span> k <span class="op">:=</span> <span class="num">1</span>; k <span class="op">&lt;=</span> <span class="num">2</span><span class="op">*</span>i<span class="op">-</span><span class="num">1</span>; k<span class="op">++</span> { fmt.<span class="fn">Print</span>(<span class="str">"*"</span>) }');
    l.push('\t\tfmt.<span class="fn">Println</span>()');
    l.push('\t}');
    l.push('}');
    return l.join('\n');
  }

  // Decide imports up front
  const needsFmt   = true;
  const needsBufio = a.syscalls.some(s => s.name === 'read');
  const needsOs    = a.syscalls.some(s => s.name === 'read' || (s.name === 'exit' && s.code !== 0));

  l.push('<span class="kw">package</span> main');
  l.push('');

  if (!needsBufio && !needsOs) {
    l.push('<span class="kw">import</span> <span class="str">"fmt"</span>');
  } else {
    l.push('<span class="kw">import</span> (');
    l.push('\t<span class="str">"fmt"</span>');
    if (needsBufio) l.push('\t<span class="str">"bufio"</span>');
    if (needsOs)    l.push('\t<span class="str">"os"</span>');
    l.push(')');
  }

  l.push('');
  l.push('<span class="kw">func</span> <span class="fn">main</span>() {');

  if (needsBufio) {
    l.push('\treader <span class="op">:=</span> bufio.<span class="fn">NewReader</span>(os.Stdin)');
  }

  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.pattern === 'pyramid') {
        const r = sc.rows;
        l.push('\trows <span class="op">:=</span> <span class="num">' + r + '</span>');
        l.push('');
        l.push('\t<span class="kw">for</span> i <span class="op">:=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> rows; i<span class="op">++</span> {');
        l.push('\t\t<span class="cm">// Print leading spaces</span>');
        l.push('\t\t<span class="kw">for</span> j <span class="op">:=</span> <span class="num">1</span>; j <span class="op">&lt;=</span> rows<span class="op">-</span>i; j<span class="op">++</span> {');
        l.push('\t\t\tfmt.<span class="fn">Print</span>(<span class="str">" "</span>)');
        l.push('\t\t}');
        l.push('\t\t<span class="cm">// Print stars</span>');
        l.push('\t\t<span class="kw">for</span> k <span class="op">:=</span> <span class="num">1</span>; k <span class="op">&lt;=</span> <span class="num">2</span><span class="op">*</span>i<span class="op">-</span><span class="num">1</span>; k<span class="op">++</span> {');
        l.push('\t\t\tfmt.<span class="fn">Print</span>(<span class="str">"*"</span>)');
        l.push('\t\t}');
        l.push('\t\t<span class="cm">// New line</span>');
        l.push('\t\tfmt.<span class="fn">Println</span>()');
        l.push('\t}');
      } else if (sc.data.endsWith('\n')) {
        l.push('\tfmt.<span class="fn">Println</span>(<span class="str">"' + escStr(sc.data.slice(0, -1)) + '"</span>)');
      } else {
        l.push('\tfmt.<span class="fn">Print</span>(<span class="str">"' + escStr(sc.data) + '"</span>)');
      }
    } else if (sc.name === 'read') {
      l.push('\tinput, _ <span class="op">:=</span> reader.<span class="fn">ReadString</span>(<span class="str">\'\\n\'</span>)');
      l.push('\t_ <span class="op">=</span> input');
    } else if (sc.name === 'exit' && sc.code !== 0) {
      l.push('\tos.<span class="fn">Exit</span>(<span class="num">' + sc.code + '</span>)');
    }
  }

  l.push('}');
  return l.join('\n');
}

// ── Python ──────────────────────────────────────────────────────────────────

function generatePython(a) {
  const l = [];
  l.push('<span class="cm"># Binary → Python</span>');
  l.push('');

  if (a.syscalls.some(sc => sc.pattern === 'custompyramid')) {
    l.push('n <span class="op">=</span> <span class="fn">int</span>(<span class="fn">input</span>(<span class="str">"Rows (1-100): "</span>) <span class="kw">or</span> <span class="num">1</span>)');
    l.push('n <span class="op">=</span> <span class="fn">max</span>(<span class="num">1</span>, <span class="fn">min</span>(<span class="num">100</span>, n))');
    l.push('');
    l.push('<span class="kw">for</span> i <span class="kw">in</span> <span class="fn">range</span>(<span class="num">1</span>, n <span class="op">+</span> <span class="num">1</span>):');
    l.push('    <span class="fn">print</span>(<span class="str">\' \'</span> <span class="op">*</span> (n <span class="op">-</span> i) <span class="op">+</span> <span class="str">\'*\'</span> <span class="op">*</span> (<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>))');
    return l.join('\n');
  }

  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.pattern === 'pyramid') {
        const r = sc.rows;
        l.push('rows <span class="op">=</span> <span class="num">' + r + '</span>');
        l.push('');
        l.push('<span class="kw">for</span> i <span class="kw">in</span> <span class="fn">range</span>(<span class="num">1</span>, rows <span class="op">+</span> <span class="num">1</span>):');
        l.push('    <span class="cm"># spaces + stars on one line — idiomatic Python</span>');
        l.push('    <span class="fn">print</span>(<span class="str">\' \'</span> <span class="op">*</span> (rows <span class="op">-</span> i) <span class="op">+</span> <span class="str">\'*\'</span> <span class="op">*</span> (<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>))');
      } else if (sc.data.endsWith('\n')) {
        l.push('<span class="fn">print</span>(<span class="str">"' + escStr(sc.data.slice(0, -1)) + '"</span>)');
      } else {
        l.push('<span class="fn">print</span>(<span class="str">"' + escStr(sc.data) + '"</span>, end<span class="op">=</span><span class="str">""</span>)');
      }
    } else if (sc.name === 'read') {
      l.push('user_input <span class="op">=</span> <span class="fn">input</span>()');
    } else if (sc.name === 'exit' && sc.code !== 0) {
      l.push('<span class="kw">import</span> sys');
      l.push('sys.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>)');
    }
  }

  return l.join('\n');
}

// ── JavaScript ──────────────────────────────────────────────────────────────

function generateJS(a) {
  const l = [];
  l.push('<span class="cm">// Binary → JavaScript (Node.js)</span>');
  l.push('');

  if (a.syscalls.some(sc => sc.pattern === 'custompyramid')) {
    l.push('<span class="kw">const</span> readline <span class="op">=</span> <span class="fn">require</span>(<span class="str">"readline"</span>);');
    l.push('<span class="kw">const</span> rl <span class="op">=</span> readline.<span class="fn">createInterface</span>({ input: process.stdin, output: process.stdout });');
    l.push('');
    l.push('rl.<span class="fn">question</span>(<span class="str">"Rows (1-100): "</span>, (input) <span class="op">=&gt;</span> {');
    l.push('  rl.<span class="fn">close</span>();');
    l.push('  <span class="kw">let</span> n <span class="op">=</span> <span class="fn">parseInt</span>(input, <span class="num">10</span>) <span class="op">||</span> <span class="num">1</span>;');
    l.push('  <span class="kw">if</span> (n <span class="op">&lt;</span> <span class="num">1</span>)   n <span class="op">=</span> <span class="num">1</span>;');
    l.push('  <span class="kw">if</span> (n <span class="op">&gt;</span> <span class="num">100</span>) n <span class="op">=</span> <span class="num">100</span>;');
    l.push('');
    l.push('  <span class="kw">for</span> (<span class="kw">let</span> i <span class="op">=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> n; i<span class="op">++</span>) {');
    l.push('    console.<span class="fn">log</span>(<span class="str">\' \'</span>.<span class="fn">repeat</span>(n <span class="op">-</span> i) <span class="op">+</span> <span class="str">\'*\'</span>.<span class="fn">repeat</span>(<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>));');
    l.push('  }');
    l.push('});');
    return l.join('\n');
  }

  const needsReadline = a.syscalls.some(s => s.name === 'read');
  if (needsReadline) {
    l.push('<span class="kw">const</span> readline <span class="op">=</span> <span class="fn">require</span>(<span class="str">"readline"</span>);');
    l.push('<span class="kw">const</span> rl <span class="op">=</span> readline.<span class="fn">createInterface</span>({ input: process.stdin });');
    l.push('');
  }

  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.pattern === 'pyramid') {
        const r = sc.rows;
        l.push('<span class="kw">const</span> rows <span class="op">=</span> <span class="num">' + r + '</span>;');
        l.push('');
        l.push('<span class="kw">for</span> (<span class="kw">let</span> i <span class="op">=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> rows; i<span class="op">++</span>) {');
        l.push('  <span class="kw">const</span> line <span class="op">=</span> <span class="str">\' \'</span>.<span class="fn">repeat</span>(rows <span class="op">-</span> i) <span class="op">+</span> <span class="str">\'*\'</span>.<span class="fn">repeat</span>(<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>);');
        l.push('  console.<span class="fn">log</span>(line);');
        l.push('}');
      } else if (sc.data.endsWith('\n')) {
        l.push('console.<span class="fn">log</span>(<span class="str">"' + escStr(sc.data.slice(0, -1)) + '"</span>);');
      } else {
        l.push('process.stdout.<span class="fn">write</span>(<span class="str">"' + escStr(sc.data) + '"</span>);');
      }
    } else if (sc.name === 'read') {
      l.push('rl.<span class="fn">once</span>(<span class="str">"line"</span>, (input) <span class="op">=&gt;</span> {');
      l.push('  rl.<span class="fn">close</span>();');
      l.push('  <span class="cm">// use input here</span>');
      l.push('});');
    } else if (sc.name === 'exit') {
      l.push('process.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }

  return l.join('\n');
}

// ── Java ────────────────────────────────────────────────────────────────────

function generateJava(a) {
  const l = [];
  l.push('<span class="cm">// Binary → Java</span>');
  l.push('');
  l.push('<span class="kw">public class</span> <span class="type">Main</span> {');
  l.push('    <span class="kw">public static void</span> <span class="fn">main</span>(<span class="type">String</span>[] args) {');

  if (a.syscalls.some(sc => sc.pattern === 'custompyramid')) {
    l.push('        <span class="type">java.util.Scanner</span> sc <span class="op">=</span> <span class="kw">new</span> <span class="type">java.util.Scanner</span>(<span class="type">System</span>.in);');
    l.push('        <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"Rows (1-100): "</span>);');
    l.push('        <span class="kw">int</span> n <span class="op">=</span> sc.<span class="fn">nextInt</span>();');
    l.push('        n <span class="op">=</span> <span class="type">Math</span>.<span class="fn">max</span>(<span class="num">1</span>, <span class="type">Math</span>.<span class="fn">min</span>(<span class="num">100</span>, n));');
    l.push('');
    l.push('        <span class="kw">for</span> (<span class="kw">int</span> i <span class="op">=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> n; i<span class="op">++</span>) {');
    l.push('            <span class="kw">for</span> (<span class="kw">int</span> j <span class="op">=</span> <span class="num">1</span>; j <span class="op">&lt;=</span> n <span class="op">-</span> i; j<span class="op">++</span>)');
    l.push('                <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">" "</span>);');
    l.push('            <span class="kw">for</span> (<span class="kw">int</span> k <span class="op">=</span> <span class="num">1</span>; k <span class="op">&lt;=</span> <span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>; k<span class="op">++</span>)');
    l.push('                <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"*"</span>);');
    l.push('            <span class="type">System</span>.out.<span class="fn">println</span>();');
    l.push('        }');
    l.push('    }');
    l.push('}');
    return l.join('\n');
  }

  const needsScanner = a.syscalls.some(s => s.name === 'read');
  if (needsScanner) {
    l.push('        <span class="type">java.util.Scanner</span> scanner <span class="op">=</span> <span class="kw">new</span> <span class="type">java.util.Scanner</span>(<span class="type">System</span>.in);');
  }

  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.pattern === 'pyramid') {
        const r = sc.rows;
        l.push('        <span class="kw">int</span> rows <span class="op">=</span> <span class="num">' + r + '</span>;');
        l.push('');
        l.push('        <span class="kw">for</span> (<span class="kw">int</span> i <span class="op">=</span> <span class="num">1</span>; i <span class="op">&lt;=</span> rows; i<span class="op">++</span>) {');
        l.push('            <span class="kw">for</span> (<span class="kw">int</span> j <span class="op">=</span> <span class="num">1</span>; j <span class="op">&lt;=</span> rows <span class="op">-</span> i; j<span class="op">++</span>)');
        l.push('                <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">" "</span>);');
        l.push('            <span class="kw">for</span> (<span class="kw">int</span> k <span class="op">=</span> <span class="num">1</span>; k <span class="op">&lt;=</span> <span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>; k<span class="op">++</span>)');
        l.push('                <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"*"</span>);');
        l.push('            <span class="type">System</span>.out.<span class="fn">println</span>();');
        l.push('        }');
      } else if (sc.data.endsWith('\n')) {
        l.push('        <span class="type">System</span>.out.<span class="fn">println</span>(<span class="str">"' + escStr(sc.data.slice(0, -1)) + '"</span>);');
      } else {
        l.push('        <span class="type">System</span>.out.<span class="fn">print</span>(<span class="str">"' + escStr(sc.data) + '"</span>);');
      }
    } else if (sc.name === 'read') {
      l.push('        <span class="type">String</span> input <span class="op">=</span> scanner.<span class="fn">nextLine</span>();');
    } else if (sc.name === 'exit') {
      l.push('        <span class="type">System</span>.<span class="fn">exit</span>(<span class="num">' + sc.code + '</span>);');
    }
  }

  l.push('    }');
  l.push('}');
  return l.join('\n');
}

// ── Ruby ────────────────────────────────────────────────────────────────────

function generateRuby(a) {
  const l = [];
  l.push('<span class="cm"># Binary → Ruby</span>');
  l.push('');

  if (a.syscalls.some(sc => sc.pattern === 'custompyramid')) {
    l.push('<span class="fn">print</span> <span class="str">"Rows (1-100): "</span>');
    l.push('n <span class="op">=</span> <span class="fn">gets</span>.<span class="fn">to_i</span>');
    l.push('n <span class="op">=</span> [[n, <span class="num">1</span>].<span class="fn">max</span>, <span class="num">100</span>].<span class="fn">min</span>');
    l.push('');
    l.push('(<span class="num">1</span><span class="op">..</span>n).<span class="fn">each</span> <span class="kw">do</span> |i|');
    l.push('  <span class="fn">print</span> <span class="str">\' \'</span> <span class="op">*</span> (n <span class="op">-</span> i)');
    l.push('  <span class="fn">print</span> <span class="str">\'*\'</span> <span class="op">*</span> (<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>)');
    l.push('  <span class="fn">puts</span>');
    l.push('<span class="kw">end</span>');
    return l.join('\n');
  }

  for (const sc of a.syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      if (sc.pattern === 'pyramid') {
        const r = sc.rows;
        l.push('rows <span class="op">=</span> <span class="num">' + r + '</span>');
        l.push('');
        l.push('(<span class="num">1</span><span class="op">..</span>rows).<span class="fn">each</span> <span class="kw">do</span> |i|');
        l.push('  <span class="fn">print</span> <span class="str">\' \'</span> <span class="op">*</span> (rows <span class="op">-</span> i)');
        l.push('  <span class="fn">print</span> <span class="str">\'*\'</span> <span class="op">*</span> (<span class="num">2</span> <span class="op">*</span> i <span class="op">-</span> <span class="num">1</span>)');
        l.push('  <span class="fn">puts</span>');
        l.push('<span class="kw">end</span>');
      } else if (sc.data.endsWith('\n')) {
        l.push('<span class="fn">puts</span> <span class="str">"' + escStr(sc.data.slice(0, -1)) + '"</span>');
      } else {
        l.push('<span class="fn">print</span> <span class="str">"' + escStr(sc.data) + '"</span>');
      }
    } else if (sc.name === 'read') {
      l.push('input <span class="op">=</span> <span class="fn">gets</span>.<span class="fn">chomp</span>');
    } else if (sc.name === 'exit') {
      l.push('<span class="fn">exit</span> <span class="num">' + sc.code + '</span>');
    }
  }

  return l.join('\n');
}

// ── Hex Dump ─────────────────────────────────────────────────────────────────

function generateRaw(a) {
  const bytes = a.rawBytes || [];
  const l = [];
  l.push('<span class="cm">// Raw binary — hex dump (first 4 KB)</span>');
  l.push('<span class="cm">// Offset    00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F  |ASCII           |</span>');
  l.push('');

  for (let i = 0; i < bytes.length; i += 16) {
    const off = '<span class="num">' + i.toString(16).padStart(8, '0') + '</span>';
    let h1 = '', h2 = '', ascii = '';
    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        const b  = bytes[i + j];
        const hx = b.toString(16).padStart(2, '0');
        const sp = b === 0
          ? '<span class="cm">' + hx + '</span>'
          : '<span class="str">' + hx + '</span>';
        if (j < 8) h1 += sp + ' '; else h2 += sp + ' ';
        ascii += (b >= 0x20 && b < 0x7F)
          ? String.fromCharCode(b).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : '<span class="cm">.</span>';
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
