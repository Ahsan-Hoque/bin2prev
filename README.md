# bin2prev — Binary to Source Preview

> A VS Code extension that lets you preview native binaries as equivalent high-level source code.

Right-click any binary in VS Code → see what it does in **Java, JavaScript, Python, Ruby, Go**, or as a **raw hex dump**.

---

## 📐 How It Works

```
┌──────────────────────────────────────────────────────────┐
│                        VS Code                           │
│                                                          │
│  Explorer                    Preview Panel               │
│  ┌──────────┐               ┌──────────────────────────┐ │
│  │ 📁 bin2prev              │ Java | JS | Python | Ruby│ │
│  │  ├── hello│  ──right──▶  │─────────────────────────-│ │
│  │  └── greet│    click     │ public class Hello {     │ │
│  └──────────┘               │   public static void     │ │
│                             │   main(String[] args) {  │ │
│                             │     System.out.print(    │ │
│                             │       "Hello, World!\n");│ │
│                             │     System.exit(0);      │ │
│                             │   }                      │ │
│                             │ }                        │ │
│                             └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

1. **Load** — Right-click a binary → "bin2prev: Preview Binary as Source Code"
2. **Analyze** — Parses Mach-O/ELF headers, decodes ARM64 instructions, detects syscalls
3. **Preview** — Shows equivalent code in 6 tabs: Java, JavaScript, Python, Ruby, Go, Raw hex

---

## 🚀 Quick Start

### Install the extension
```bash
cd vscode-ext
npm install
npx @vscode/vsce package --allow-missing-repository
code --install-extension bin2prev-0.0.1.vsix
```

### Try with example binaries
```bash
# "Hello, World!" — prints and exits
./examples/hello

# Interactive greeter — asks your name in a loop, Ctrl+C to exit
./examples/greet
```

Then right-click either binary in VS Code's explorer → **"bin2prev: Preview Binary as Source Code"**

---

## 📁 Project Structure

```
bin2prev/
├── README.md
├── examples/                # Example native ARM64 binaries
│   ├── hello                #   prints "Hello, World!" and exits
│   └── greet                #   interactive name prompt loop
└── vscode-ext/              # VS Code extension
    ├── package.json         #   extension manifest
    └── src/
        ├── extension.js     #   command registration + webview panel
        ├── analyzer.js      #   binary parser (Mach-O, ELF, ARM64 decoder)
        └── webview.js       #   HTML/CSS/JS for the preview panel
```

---

## 🔍 What It Detects

| Binary Format | Instruction Set | Syscalls |
|---------------|----------------|----------|
| Mach-O 64-bit | ARM64 (MOVZ, ADR, SVC) | write, read, exit |
| Mach-O 32-bit | — (string fallback) | — |
| ELF 32/64-bit | — (string fallback) | — |
| PE (Windows) | — (string fallback) | — |

---

## 🛠 Example Binaries

### `hello`
Native ARM64 Mach-O binary — prints "Hello, World!" using raw kernel syscalls (`write` + `exit`). No compiler, no runtime.

### `greet`
Interactive ARM64 binary — prompts "Enter your name (^C):", reads input, prints "Hello, \<name\>", loops until Ctrl+C. Uses `write` + `read` syscalls.

---

## 📜 License

MIT

