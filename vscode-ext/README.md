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
│  │  ├── hello│  ──click──▶  │─────────────────────────-│ │
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

1. **Open** — Double-click any binary file, or right-click → "bin2prev: Preview Binary as Source Code"
2. **Analyze** — Parses Mach-O/ELF headers, decodes ARM64 instructions, detects syscalls
3. **Preview** — Shows equivalent code in 6 tabs: Raw Binary, Java, JavaScript, Python, Ruby, Go

---

## 🚀 Install

1. Open **VS Code**
2. Go to **Extensions** (`Cmd+Shift+X` on Mac / `Ctrl+Shift+X` on Windows/Linux)
3. Search for **`bin2prev`**
4. Click **Install**

That's it — you're ready to preview binaries.

---

## 🎯 Usage

### Open a binary
Just **double-click** any binary file in VS Code's explorer — bin2prev opens it automatically with a raw hex view and language preview tabs.

### Right-click menu
Right-click any file → **"bin2prev: Preview Binary as Source Code"**

### Command palette
`Cmd+Shift+P` → type **"bin2prev"** → select **"Preview Binary as Source Code"**

---

## 🔍 Supported Formats

| Binary Format | Instruction Set | Syscalls Detected |
|---------------|----------------|-------------------|
| Mach-O 64-bit | ARM64 (MOVZ, ADR, SVC) | write, read, exit |
| Mach-O 32-bit | — (string fallback) | — |
| ELF 32/64-bit | — (string fallback) | — |
| PE (Windows) | — (string fallback) | — |

---

## 🌐 Preview Languages

- **Raw Binary** — Hex dump with ASCII view (default)
- **Java** — Equivalent Java source code
- **JavaScript** — Node.js equivalent
- **Python** — Python 3 equivalent
- **Ruby** — Ruby equivalent
- **Go** — Go equivalent

---

## 💡 The Vision

High-level languages exist for developers — not for machines. Machines understand native binary. With AI agents, developers can now write native code directly and use **bin2prev** to preview it in whatever language they're most comfortable reading.

**Write native. Preview human.**

---

## 📜 License

MIT
