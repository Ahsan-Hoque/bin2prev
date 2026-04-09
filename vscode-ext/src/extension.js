const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { analyzeBinary } = require('./analyzer');
const { getWebviewContent } = require('./webview');

function activate(context) {
  const cmd = vscode.commands.registerCommand('bin2prev.preview', async (uri) => {
    // If invoked from command palette, ask for file
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
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(fileName, bytes.length, analysis);
  });

  context.subscriptions.push(cmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
