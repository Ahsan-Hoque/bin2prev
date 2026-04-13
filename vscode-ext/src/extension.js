const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { analyzeBinary } = require('./analyzer');
const { getWebviewContent } = require('./webview');

// ---------------------------------------------------------------------------
// Binary file detection
//
// A file is considered a "native binary" if it has:
//   • No file extension at all  (Unix executables: pyramid, hello, greet, …)
//   • A recognised binary/machine-code extension
//
// Any file that carries a text / source-code extension is rejected so that
// the previewer never intercepts normal editing workflows.
// ---------------------------------------------------------------------------

const BINARY_EXTENSIONS = new Set([
  // Native executables & libraries
  '.exe', '.dll', '.so', '.dylib', '.lib', '.a', '.o', '.obj',
  // Generic binary outputs
  '.bin', '.out', '.elf',
  // Platform / low-level
  '.sys', '.ko', '.pdb',
  // VM bytecode (still "machine-readable", not human-readable source)
  '.wasm', '.class', '.jar', '.dex', '.apk',
  // Firmware / ROM images
  '.img', '.rom', '.fw', '.hex',
]);

/**
 * Returns true when the file should be handled by this extension:
 *   - extensionless files  → native Unix/macOS/Linux executables
 *   - files whose extension is in BINARY_EXTENSIONS
 * Returns false for every file that has a text / source-code extension
 * (.js, .ts, .py, .go, .java, .rb, .txt, .json, .md, …).
 */
function isBinaryFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '' || BINARY_EXTENSIONS.has(ext);
}

class BinaryPreviewProvider {
  constructor() {
    this._onDidChangeCustomDocument = new vscode.EventEmitter();
    this.onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
  }

  openCustomDocument(uri) {
    return { uri, dispose() {} };
  }

  async resolveCustomEditor(document, webviewPanel) {
    webviewPanel.webview.options = { enableScripts: true };
    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

    // Safety net: if somehow a non-binary file reaches this editor (should not
    // happen once package.json no longer has the "*" selector), show a neutral
    // message instead of crashing with dispose().
    if (!isBinaryFile(filePath)) {
      webviewPanel.webview.html =
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;">` +
        `<p><strong>bin2prev</strong>: "${fileName}" is not a native binary file.</p>` +
        `<p>Close this tab and open the file normally.</p></body></html>`;
      return;
    }

    let bytes;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (err) {
      webviewPanel.webview.html = `<p>Error reading file: ${err.message}</p>`;
      return;
    }

    const analysis = analyzeBinary(new Uint8Array(bytes));
    webviewPanel.webview.html = getWebviewContent(fileName, bytes.length, analysis);
  }
}

function activate(context) {
  // Custom editor for binary files — opens automatically
  const provider = new BinaryPreviewProvider();
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('bin2prev.binaryPreview', provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // Command for right-click / command palette
  const cmd = vscode.commands.registerCommand('bin2prev.preview', async (uri) => {
    if (!uri) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Select Binary',
        filters: { 'All Files': ['*'] }
      });
      if (!picked || picked.length === 0) return;
      uri = picked[0];
    }

    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);

    // Reject files with text / source-code extensions
    if (!isBinaryFile(filePath)) {
      vscode.window.showInformationMessage(
        `bin2prev: "${fileName}" has a source/text extension — ` +
        `only native binary files (no extension, or .exe / .so / .dylib / …) can be previewed.`
      );
      return;
    }

    let bytes;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (err) {
      vscode.window.showErrorMessage(`bin2prev: Could not read file — ${err.message}`);
      return;
    }

    const analysis = analyzeBinary(new Uint8Array(bytes));

    const panel = vscode.window.createWebviewPanel(
      'bin2prev',
      `bin2prev: ${fileName}`,
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(fileName, bytes.length, analysis);
  });

  context.subscriptions.push(cmd);

  // Magic-byte listener: open extensionless files that are native binaries
  // (Mach-O, ELF, PE) with our custom editor automatically.
  // onDidOpenTextDocument fires only for text documents, so custom editor
  // opens do NOT re-trigger this — no infinite loop risk.
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (doc.uri.scheme !== 'file') return;
      const filePath = doc.uri.fsPath;
      if (path.extname(filePath) !== '') return; // only extensionless files

      try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        const bytesRead = fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        if (bytesRead < 4) return;

        const magic32le = buf.readUInt32LE(0);
        const isBinaryMagic =
          magic32le === 0xFEEDFACF || // Mach-O 64-bit LE
          magic32le === 0xFEEDFACE || // Mach-O 32-bit LE
          magic32le === 0xCFFAEDFE || // Mach-O 64-bit BE
          magic32le === 0xCEFAEDFE || // Mach-O 32-bit BE
          (buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46) || // ELF
          (buf[0] === 0x4D && buf[1] === 0x5A); // PE (MZ)

        if (isBinaryMagic) {
          await vscode.commands.executeCommand(
            'vscode.openWith', doc.uri, 'bin2prev.binaryPreview'
          );
        }
      } catch (_) { /* ignore read errors */ }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
