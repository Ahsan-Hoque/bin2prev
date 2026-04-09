import * as java from './languages/java.js';
import * as javascript from './languages/javascript.js';
import * as python from './languages/python.js';
import * as ruby from './languages/ruby.js';
import * as go from './languages/go.js';

const languages = [java, javascript, python, ruby, go];

// --- DOM refs ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewPanel = document.getElementById('preview-panel');
const fileNameEl = document.getElementById('file-name');
const fileSizeEl = document.getElementById('file-size');
const fileFormatEl = document.getElementById('file-format');
const tabsEl = document.getElementById('tabs');
const codeOutput = document.getElementById('code-output');
const copyBtn = document.getElementById('copy-btn');

let currentAnalysis = null;
let activeTab = 0;

// --- Prevent browser from opening dropped files in a new tab ---
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// --- Drop zone events ---
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

// --- Copy button ---
copyBtn.addEventListener('click', () => {
  const text = codeOutput.textContent;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = '✅ Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '📋 Copy';
      copyBtn.classList.remove('copied');
    }, 2000);
  });
});

// --- Main handler ---
async function handleFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const format = detectFormat(bytes);
  currentAnalysis = analyzeBinary(bytes, format);

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileFormatEl.textContent = format.name;

  buildTabs();
  renderCode(0);
  previewPanel.classList.remove('hidden');
}

// --- Binary format detection ---
function detectFormat(bytes) {
  if (bytes.length < 4) return { name: 'Unknown', type: 'unknown' };

  // Mach-O
  const magic32 = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  if (magic32 === 0xFEEDFACF) return { name: 'Mach-O 64-bit (LE)', type: 'macho64', endian: 'little' };
  if (magic32 === 0xFEEDFACE) return { name: 'Mach-O 32-bit (LE)', type: 'macho32', endian: 'little' };
  const magicBE = (bytes[3] | (bytes[2] << 8) | (bytes[1] << 16) | (bytes[0] << 24)) >>> 0;
  if (magicBE === 0xFEEDFACF) return { name: 'Mach-O 64-bit (BE)', type: 'macho64', endian: 'big' };

  // ELF
  if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
    const bits = bytes[4] === 2 ? '64' : '32';
    return { name: `ELF ${bits}-bit`, type: `elf${bits}`, endian: bytes[5] === 1 ? 'little' : 'big' };
  }

  // PE (Windows)
  if (bytes[0] === 0x4D && bytes[1] === 0x5A) return { name: 'PE (Windows)', type: 'pe' };

  return { name: 'Unknown binary', type: 'unknown' };
}

// --- Binary analysis ---
function analyzeBinary(bytes, format) {
  const syscalls = [];
  const strings = extractStrings(bytes);

  if (format.type === 'macho64') {
    analyzeMachO64(bytes, syscalls, strings);
  } else if (format.type.startsWith('elf')) {
    analyzeELF(bytes, syscalls, strings);
  } else {
    analyzeGeneric(bytes, syscalls, strings);
  }

  // Fallback: if no syscalls detected, try to infer from strings
  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }

  return { format, syscalls, strings };
}

function analyzeMachO64(bytes, syscalls, strings) {
  const view = new DataView(bytes.buffer);

  // Parse Mach-O header
  const ncmds = view.getUint32(16, true);
  let offset = 32; // after header

  let textSection = null;

  // Walk load commands to find __text section
  for (let i = 0; i < ncmds && offset < bytes.length - 8; i++) {
    const cmd = view.getUint32(offset, true);
    const cmdsize = view.getUint32(offset + 4, true);

    if (cmd === 0x19) { // LC_SEGMENT_64
      const segname = readString(bytes, offset + 8, 16);
      const nsects = view.getUint32(offset + 64, true);

      let sectOffset = offset + 72;
      for (let s = 0; s < nsects && sectOffset < offset + cmdsize; s++) {
        const sectname = readString(bytes, sectOffset, 16);
        if (sectname === '__text' && segname === '__TEXT') {
          const addr = Number(view.getBigUint64(sectOffset + 32, true));
          const size = Number(view.getBigUint64(sectOffset + 40, true));
          const fileoff = view.getUint32(sectOffset + 48, true);
          textSection = { addr, size, offset: fileoff };
        }
        sectOffset += 80;
      }
    }
    offset += cmdsize;
  }

  if (!textSection) return;

  // Scan ARM64 instructions in __text
  const codeStart = textSection.offset;
  const codeEnd = codeStart + textSection.size;
  scanARM64Syscalls(bytes, view, codeStart, codeEnd, textSection, syscalls);
}

function scanARM64Syscalls(bytes, view, codeStart, codeEnd, textSection, syscalls) {
  let regs = new Array(33).fill(0); // x0-x28, fp, lr, sp, x16

  for (let pc = codeStart; pc + 4 <= codeEnd; pc += 4) {
    const inst = view.getUint32(pc, true);

    // MOVZ Xd, #imm16
    if ((inst & 0xFF800000) === 0xD2800000) {
      const rd = inst & 0x1F;
      const imm16 = (inst >> 5) & 0xFFFF;
      const hw = (inst >> 21) & 0x3;
      if (rd < regs.length) regs[rd] = imm16 << (hw * 16);
    }

    // ADR Xd, #offset
    if ((inst & 0x9F000000) === 0x10000000) {
      const rd = inst & 0x1F;
      const immhi = (inst >> 5) & 0x7FFFF;
      const immlo = (inst >> 29) & 0x3;
      let imm = (immhi << 2) | immlo;
      if (imm & 0x100000) imm |= ~0x1FFFFF; // sign extend
      if (rd < regs.length) {
        regs[rd] = textSection.addr + (pc - textSection.offset) + imm;
      }
    }

    // SVC #0x80 — macOS syscall
    if (inst === 0xD4001001) {
      const syscallNum = regs[16];
      if (syscallNum === 4) { // write
        const fd = regs[0];
        const bufAddr = regs[1];
        const len = regs[2];
        const bufOff = bufAddr - textSection.addr + textSection.offset;
        const data = readStringAt(bytes, bufOff, len);
        syscalls.push({ name: 'write', fd, data, len });
      } else if (syscallNum === 1) { // exit
        syscalls.push({ name: 'exit', code: regs[0] });
      }
    }
  }
}

function analyzeELF(bytes, syscalls, strings) {
  if (bytes.length < 64) return;
  const view = new DataView(bytes.buffer);
  const is64 = bytes[4] === 2;
  const isLE = bytes[5] === 1;

  // Find .text section by scanning section headers
  let shoff, shentsize, shnum;
  if (is64) {
    shoff = Number(view.getBigUint64(40, isLE));
    shentsize = view.getUint16(58, isLE);
    shnum = view.getUint16(60, isLE);
  } else {
    shoff = view.getUint32(32, isLE);
    shentsize = view.getUint16(46, isLE);
    shnum = view.getUint16(48, isLE);
  }

  // Try to find syscall patterns (x86_64: syscall = 0F 05, int 0x80 = CD 80)
  for (let i = 0; i < bytes.length - 1; i++) {
    if ((bytes[i] === 0x0F && bytes[i + 1] === 0x05) ||
        (bytes[i] === 0xCD && bytes[i + 1] === 0x80)) {
      // Heuristic: look for strings near syscall instructions
      break;
    }
  }

  // Fallback to string-based analysis
  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }
}

function analyzeGeneric(bytes, syscalls, strings) {
  if (strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }
}

// --- String extraction ---
function extractStrings(bytes) {
  const results = [];
  let current = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b < 0x7F || b === 0x0A || b === 0x09) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) results.push(current);
      current = '';
    }
  }
  if (current.length >= 4) results.push(current);

  // Filter out common Mach-O/ELF metadata strings
  const noise = ['__TEXT', '__text', '__DATA', '__PAGEZERO', '__LINKEDIT',
    'dyld', '.text', '.data', '.bss', '.rodata', '.symtab', '.strtab',
    '_main', '/usr/', 'Library/', 'MacOSX'];
  return results.filter(s => !noise.some(n => s.includes(n)));
}

// --- Helpers ---
function readString(bytes, offset, maxLen) {
  let s = '';
  for (let i = 0; i < maxLen && offset + i < bytes.length; i++) {
    if (bytes[offset + i] === 0) break;
    s += String.fromCharCode(bytes[offset + i]);
  }
  return s;
}

function readStringAt(bytes, offset, len) {
  let s = '';
  for (let i = 0; i < len && offset + i < bytes.length; i++) {
    s += String.fromCharCode(bytes[offset + i]);
  }
  return s;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// --- Tabs & rendering ---
function buildTabs() {
  tabsEl.innerHTML = '';
  languages.forEach((lang, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === 0 ? ' active' : '');
    btn.textContent = lang.name;
    btn.role = 'tab';
    btn.addEventListener('click', () => renderCode(i));
    tabsEl.appendChild(btn);
  });
}

function renderCode(index) {
  activeTab = index;
  tabsEl.querySelectorAll('.tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });
  codeOutput.innerHTML = languages[index].generate(currentAnalysis);
}
