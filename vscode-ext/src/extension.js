const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { analyzeBinary } = require('./analyzer');
const { getWebviewContent } = require('./webview');

class BinaryPreviewProvider {
  constructor() {
    this._onDidChangeCustomDocument = new vscode.EventEmitter();
    this.onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
  }

  openCustomDocument(uri) {
    return { uri, dispose() {} };
  }

  resolveCustomEditor(document, webviewPanel) {
    webviewPanel.webview.options = { enableScripts: true };
    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

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
}

function deactivate() {}

module.exports = { activate, deactivate };
