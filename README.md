# bin2prev — Preview Native Code in Your Beloved Language

> Machines don't speak Java, Python, or JavaScript — they speak **native binary**.

High-level languages were invented for humans, not machines. Every line of Python or Java you write gets compiled down to the binary that the CPU actually executes. **The native code is the real code.** Everything else is a translation.

With AI agents, you can now **write native binary directly** — the way machines actually think. No compiler, no runtime, no abstraction layers. Just raw instructions the CPU understands.

**bin2prev** bridges the gap: write native with your agent, then preview it in your preferred language — **Java, JavaScript, Python, Ruby, Go** — so you can read what the machine already understands.

**Write native. Preview human.**

---

## 📐 How It Works

```
┌──────────────────────────────────────────────────────────┐
│                        VS Code                           │
│                                                          │
│  Explorer                    Preview Panel               │
│  ┌──────────┐               ┌──────────────────────────┐ │
│  │ 📁 bin2prev              │ Raw | Java | JS | Python │ │
│  │  ├── hello│ ──dbl-click─▶│─────────────────────────-│ │
│  │  └── greet│              │ public class Hello {     │ │
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

1. **Open** — Double-click any binary file — bin2prev opens it automatically
2. **Analyze** — Parses Mach-O/ELF headers, decodes ARM64 instructions, detects syscalls
3. **Preview** — Shows equivalent code in 6 tabs: Raw Binary, Java, JavaScript, Python, Ruby, Go

---

## 🚀 Install

### From VS Code Marketplace (Recommended)

1. Open **VS Code**
2. Go to **Extensions** (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows/Linux)
3. Search for **`bin2prev`**
4. Click **Install**

That's it — you're ready to preview binaries.

### From Source (Development)
```bash
git clone https://github.com/Ahsan-Hoque/bin2prev.git
cd bin2prev/vscode-ext
npm install
npx @vscode/vsce package --allow-missing-repository
code --install-extension bin2prev-0.0.4.vsix
```

---

## 🎯 Usage

### Open a binary
Just **double-click** any binary file in VS Code's explorer — bin2prev opens it automatically with a raw hex view and language preview tabs.

### Right-click menu
Right-click any file → **"bin2prev: Preview Binary as Source Code"**

### Command palette
`Cmd+Shift+P` → type **"bin2prev"** → select **"Preview Binary as Source Code"**

### Try with example binaries
```bash
# "Hello, World!" — prints and exits
./examples/hello

# Interactive greeter — asks your name in a loop, Ctrl+C to exit
./examples/greet
```

Open either binary in VS Code to see it previewed as Java, JavaScript, Python, Ruby, or Go.

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

