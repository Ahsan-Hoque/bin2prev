# bin2prev — Binary to Preview

> Turn raw native binaries into human-readable high-level language previews.

## 🧠 Concept

This project has **two independent parts**:

### Part 1: `hello` — Hand-Crafted Native Binary
A "Hello World" executable written as **raw machine code** — no compiler, no runtime, no dependencies. Just bytes that the CPU understands directly. It produces a valid Mach-O (macOS ARM64) binary that the OS can load and execute.

### Part 2: `previewer/` — Binary-to-Source Web Previewer
A lightweight browser app (plain HTML/CSS/JS) that **reads any binary** and shows what its logic would look like in multiple high-level languages. Switch between tabs to see the same program expressed in Java, JavaScript, Ruby, Python, and more.

---

## 📐 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      bin2prev                           │
├────────────────────────┬────────────────────────────────┤
│                        │                                │
│   Part 1: Native       │   Part 2: Web Previewer        │
│   Binary (CLI)         │   (Browser App)                │
│                        │                                │
│  ┌──────────────────┐  │  ┌──────────────────────────┐  │
│  │  Raw machine code│  │  │  index.html              │  │
│  │  (ARM64 / x86)   │  │  │  ├── style.css           │  │
│  │                   │  │  │  ├── app.js              │  │
│  │  Mach-O / ELF    │  │  │  └── languages/          │  │
│  │  executable       │  │  │      ├── java.js         │  │
│  │                   │  │  │      ├── javascript.js   │  │
│  │  $ ./hello        │  │  │      ├── ruby.js         │  │
│  │  > Hello, World!  │  │  │      ├── python.js       │  │
│  └──────────────────┘  │  │      └── go.js            │  │
│                        │  └──────────────────────────┘  │
│                        │                                │
│  No compiler needed.   │  No build step. Just open      │
│  Already native.       │  index.html in a browser.      │
│                        │                                │
├────────────────────────┴────────────────────────────────┤
│                                                         │
│                    Data Flow                            │
│                                                         │
│   ┌──────────┐    drag & drop    ┌────────────────┐     │
│   │  Binary   │ ───────────────▶ │  Web Previewer │     │
│   │  (hello)  │    or file pick  │                │     │
│   └──────────┘                   │  ┌──────────┐  │     │
│                                  │  │ Analyze   │  │     │
│                                  │  │ bytes &   │  │     │
│                                  │  │ detect    │  │     │
│                                  │  │ syscalls  │  │     │
│                                  │  └─────┬────┘  │     │
│                                  │        │       │     │
│                                  │        ▼       │     │
│                                  │  ┌──────────┐  │     │
│                                  │  │ Generate  │  │     │
│                                  │  │ previews  │  │     │
│                                  │  │ per lang  │  │     │
│                                  │  └─────┬────┘  │     │
│                                  │        │       │     │
│                                  │        ▼       │     │
│                                  │  ┏━━━━━━━━━━━━━━━┓  │
│                                  │  ┃ Java | JS | Ruby ┃│
│                                  │  ┃───────────────────┃│
│                                  │  ┃ public class Hello┃│
│                                  │  ┃ {                 ┃│
│                                  │  ┃   public static   ┃│
│                                  │  ┃   void main(..){  ┃│
│                                  │  ┃     System.out.   ┃│
│                                  │  ┃     println(      ┃│
│                                  │  ┃     "Hello World")┃│
│                                  │  ┃   }               ┃│
│                                  │  ┃ }                 ┃│
│                                  │  ┗━━━━━━━━━━━━━━━┛  │
│                                  └────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Run the native binary
```bash
# No compilation — it's already machine code
chmod +x hello
./hello
# Output: Hello, World!
```

### Launch the previewer
```bash
# No build step — just open in browser
open previewer/index.html
# Then drag & drop the "hello" binary (or any binary) into the page
```

---

## 📁 Project Structure

```
bin2prev/
├── README.md
├── hello                  # Part 1: raw native binary (Mach-O ARM64)
└── previewer/             # Part 2: web-based binary previewer
    ├── index.html         #   main page with tabbed UI
    ├── style.css          #   styling
    ├── app.js             #   core logic: binary parser + tab controller
    └── languages/         #   language-specific code generators
        ├── java.js
        ├── javascript.js
        ├── ruby.js
        ├── python.js
        └── go.js
```

---

## 🎯 How the Previewer Works

1. **Load** — Drag & drop a binary file or use the file picker
2. **Analyze** — The app reads the binary bytes, detects the format (Mach-O/ELF), and identifies syscalls (write, exit, etc.)
3. **Map** — Syscalls and data are mapped to language-specific equivalents
4. **Preview** — Switch between tabs to see the same logic in Java, JavaScript, Ruby, Python, or Go

---

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| Native binary | Raw ARM64 machine code, Mach-O format |
| Web UI | Plain HTML + CSS + vanilla JS |
| Code highlighting | Built-in (no external deps) |
| Binary parsing | Custom JS parser (no libraries) |

---

## 📜 License

MIT
