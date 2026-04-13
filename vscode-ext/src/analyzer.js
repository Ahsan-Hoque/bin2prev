/**
 * Binary analyzer — detects format, extracts syscalls & strings.
 * Pure Node.js, no native dependencies.
 * Works identically on Windows, macOS, and Linux — the host OS has no effect
 * on the analysis; only the binary's own format and content matter.
 */

function analyzeBinary(bytes) {
  const format = detectFormat(bytes);
  const syscalls = [];
  const strings = extractStrings(bytes);

  if (format.type === 'macho64') {
    analyzeMachO64(bytes, syscalls);
  } else if (format.type.startsWith('elf')) {
    analyzeELF(bytes, syscalls, strings);
  }

  // Fallback: if instruction-level analysis found nothing, use extracted strings
  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }

  // Post-process: tag write syscalls with high-level patterns
  for (const sc of syscalls) {
    if (sc.name === 'write' && sc.fd === 1) {
      const rows = detectPyramid(sc.data);
      if (rows > 0) {
        sc.pattern = 'pyramid';
        sc.rows = rows;
      }
    }
  }

  // Detect custom pyramid: a prompt write containing "row" followed by a
  // stdin read means the binary asks the user for the row count at runtime.
  const promptIdx = syscalls.findIndex(
    sc => sc.name === 'write' && sc.fd === 1 && sc.data && /row/i.test(sc.data)
  );
  const hasReadAfterPrompt =
    promptIdx >= 0 &&
    syscalls.slice(promptIdx + 1).some(sc => sc.name === 'read' && sc.fd === 0);
  if (hasReadAfterPrompt) {
    syscalls[promptIdx].pattern = 'custompyramid';
  }

  return { format, syscalls, strings, rawBytes: Array.from(bytes.slice(0, 4096)) };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(bytes) {
  if (bytes.length < 4) return { name: 'Unknown', type: 'unknown' };

  const m32 = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  if (m32 === 0xFEEDFACF) return { name: 'Mach-O 64-bit', type: 'macho64', endian: 'little' };
  if (m32 === 0xFEEDFACE) return { name: 'Mach-O 32-bit', type: 'macho32', endian: 'little' };
  if (m32 === 0xCFFAEDFE) return { name: 'Mach-O 64-bit (BE)', type: 'macho64', endian: 'big' };

  if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
    const bits = bytes[4] === 2 ? '64' : '32';
    const endian = bytes[5] === 1 ? 'little' : 'big';
    return { name: `ELF ${bits}-bit`, type: `elf${bits}`, endian };
  }

  if (bytes[0] === 0x4D && bytes[1] === 0x5A) return { name: 'PE (Windows)', type: 'pe' };

  return { name: 'Unknown binary', type: 'unknown' };
}

// ---------------------------------------------------------------------------
// Mach-O 64-bit analysis
// ---------------------------------------------------------------------------

function analyzeMachO64(bytes, syscalls) {
  if (bytes.length < 32) return;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cpuType = view.getUint32(4, true);   // offset 4: cputype
  const ncmds   = view.getUint32(16, true);  // offset 16: ncmds

  // Build a map of all sections so we can read strings from __cstring, __data, etc.
  const sectionMap = []; // {name, segname, vmaddr, vmsize, fileOff}
  let textSection = null;
  let offset = 32;

  for (let i = 0; i < ncmds && offset + 8 < bytes.length; i++) {
    const cmd     = view.getUint32(offset, true);
    const cmdsize = view.getUint32(offset + 4, true);
    if (cmdsize < 8) break; // malformed

    if (cmd === 0x19) { // LC_SEGMENT_64
      const segname = readCStr(bytes, offset + 8, 16);
      const nsects  = view.getUint32(offset + 64, true);
      let so = offset + 72;
      for (let s = 0; s < nsects && so + 80 <= offset + cmdsize; s++) {
        const sname   = readCStr(bytes, so, 16);
        const vmaddr  = Number(view.getBigUint64(so + 32, true));
        const vmsize  = Number(view.getBigUint64(so + 40, true));
        const fileOff = view.getUint32(so + 48, true);
        sectionMap.push({ name: sname, segname, vmaddr, vmsize, fileOff });
        if (sname === '__text' && segname === '__TEXT') {
          textSection = { addr: vmaddr, size: vmsize, offset: fileOff };
        }
        so += 80;
      }
    }
    offset += cmdsize;
  }

  if (!textSection) return;

  // Dispatch by CPU architecture
  const arch = cpuType & 0x00FFFFFF;
  if (arch === 0x0C) {
    // ARM64 (AArch64)
    scanARM64(bytes, view, textSection, sectionMap, syscalls);
  }
  // x86_64 (arch === 0x07) and others: fall through to string extraction
}

// ---------------------------------------------------------------------------
// ARM64 instruction scanner
// Handles: MOVZ, MOVK, ADR, ADRP, ADD(imm), SVC #0x80
// Resolves string addresses across all Mach-O sections (not just __text),
// so binaries that store strings in __cstring or __data work correctly.
// ---------------------------------------------------------------------------

function scanARM64(bytes, view, ts, sectionMap, syscalls) {
  const regs = new Array(32).fill(0); // x0–x31 (x31/XZR reads as 0)

  for (let pc = ts.offset; pc + 4 <= ts.offset + ts.size; pc += 4) {
    const inst    = view.getUint32(pc, true);
    const pcVAddr = ts.addr + (pc - ts.offset);

    // MOVZ Xd, #imm16, LSL #(hw*16) — zero other bits
    // Use >>> 0 on both sides to avoid signed Int32 comparison issues
    if (((inst & 0xFF800000) >>> 0) === (0xD2800000 >>> 0)) {
      const rd  = inst & 0x1F;
      const imm = (inst >> 5) & 0xFFFF;
      const hw  = (inst >> 21) & 0x3;
      if (rd < 31) regs[rd] = imm << (hw * 16);
      continue;
    }

    // MOVK Xd, #imm16, LSL #(hw*16) — keep other bits
    if (((inst & 0xFF800000) >>> 0) === (0xF2800000 >>> 0)) {
      const rd    = inst & 0x1F;
      const imm   = (inst >> 5) & 0xFFFF;
      const hw    = (inst >> 21) & 0x3;
      const shift = hw * 16;
      if (rd < 31) regs[rd] = (regs[rd] & ~(0xFFFF << shift)) | (imm << shift);
      continue;
    }

    // ADR Xd, label — PC + sign_extend(imm21), bit 31 = 0
    if ((inst & 0x9F000000) === 0x10000000) {
      const rd    = inst & 0x1F;
      const immhi = (inst >> 5) & 0x7FFFF;
      const immlo = (inst >> 29) & 0x3;
      let   imm   = (immhi << 2) | immlo;
      if (imm & 0x100000) imm |= ~0x1FFFFF; // sign extend 21-bit
      if (rd < 31) regs[rd] = pcVAddr + imm;
      continue;
    }

    // ADRP Xd, label — (PC[63:12] + sign_extend(imm21)) << 12, bit 31 = 1
    if ((inst & 0x9F000000) === 0x90000000) {
      const rd    = inst & 0x1F;
      const immhi = (inst >> 5) & 0x7FFFF;
      const immlo = (inst >> 29) & 0x3;
      let   imm   = (immhi << 2) | immlo;
      if (imm & 0x100000) imm |= ~0x1FFFFF;
      if (rd < 31) regs[rd] = (pcVAddr & ~0xFFF) + (imm << 12);
      continue;
    }

    // ADD (immediate, 64-bit): Xd = Xn + imm12 [or imm12 << 12]
    if (((inst & 0xFF000000) >>> 0) === (0x91000000 >>> 0)) {
      const rd    = inst & 0x1F;
      const rn    = (inst >> 5) & 0x1F;
      const imm12 = (inst >> 10) & 0xFFF;
      const shift = (inst >> 22) & 0x3;
      if (rd < 31) regs[rd] = regs[rn < 31 ? rn : 0] + (shift === 1 ? imm12 << 12 : imm12);
      continue;
    }

    // SVC #0x80 — macOS kernel gateway
    if ((inst >>> 0) === (0xD4001001 >>> 0)) {
      const x16 = regs[16]; // syscall number
      if (x16 === 4) {
        // write(fd=x0, buf=x1, len=x2)
        const data = readAtVAddr(bytes, sectionMap, regs[1], regs[2]);
        if (data) syscalls.push({ name: 'write', fd: regs[0], data, len: regs[2] });
      } else if (x16 === 1) {
        // exit(code=x0) — stop scanning; bytes after this are data, not instructions
        syscalls.push({ name: 'exit', code: regs[0] });
        break;
      } else if (x16 === 3) {
        // read(fd=x0, buf=x1, len=x2)
        syscalls.push({ name: 'read', fd: regs[0], len: regs[2] });
      }
    }
  }
}

// Read `len` bytes starting at virtual address `addr` using the section map.
function readAtVAddr(bytes, sectionMap, addr, len) {
  if (!len || len <= 0 || len > 65536) return '';
  for (const sec of sectionMap) {
    if (sec.fileOff > 0 && addr >= sec.vmaddr && addr < sec.vmaddr + sec.vmsize) {
      return readStrAt(bytes, sec.fileOff + (addr - sec.vmaddr), len);
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// ELF analysis — instruction scanning for common architectures can be added
// here; for now we rely on the extractStrings fallback.
// ---------------------------------------------------------------------------

function analyzeELF(bytes, syscalls, strings) {
  // ELF: use extracted strings as the signal (see extractStrings below).
  // ARM64 ELF instruction scanning would use the same scanARM64 function
  // with Linux syscall numbers (write=64, exit=93, read=63).
  // That extension is left for future work; the string fallback handles
  // most simple programs correctly today.
  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }
}

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

/**
 * Detect a centred star pyramid.
 * Row i (0-indexed, out of N): (N-1-i) spaces + (2i+1) stars
 * Returns the row count if the entire string matches, 0 otherwise.
 */
function detectPyramid(data) {
  if (!data || !data.includes('*')) return 0;
  const lines = data.split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return 0;
  const n = lines.length;
  for (let i = 0; i < n; i++) {
    const spaces = n - 1 - i;
    const stars  = 2 * i + 1;
    const line   = lines[i];
    if (line.length !== spaces + stars) return 0;
    for (let j = 0; j < spaces; j++) if (line[j] !== ' ') return 0;
    for (let j = spaces; j < line.length; j++) if (line[j] !== '*') return 0;
  }
  return n;
}

// ---------------------------------------------------------------------------
// String extraction — generic fallback for any binary format
// ---------------------------------------------------------------------------

function extractStrings(bytes) {
  const results = [];
  let cur = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 0x20 && b < 0x7F) || b === 0x0A || b === 0x09) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= 4) results.push(cur);
      cur = '';
    }
  }
  if (cur.length >= 4) results.push(cur);

  // Filter binary metadata noise common to Mach-O, ELF, and PE formats
  const noiseSubstrings = [
    '__TEXT', '__text', '__DATA', '__PAGEZERO', '__LINKEDIT', '__OBJC',
    '__stubs', '__stub_helper', '__got', '__bss', '__cstring',
    'dyld', 'dylib', '.text', '.data', '.bss', '.rodata',
    '.symtab', '.strtab', '.shstrtab', '.rela', '.plt', '.got', '.dynamic',
    '_main', '_mh_execute_header', '/usr/', '/lib/', '/System/', '/proc/',
    'Library/', 'MacOSX', 'LLVM', 'clang', 'GCC:', 'GNU C',
  ];
  // Symbol-like prefixes: _foo, $foo, .foo, or pure version strings like 1.2.3
  const symbolRe = /^[_$@][A-Za-z_]|^\d+\.\d+\.\d/;

  return results.filter(s =>
    !noiseSubstrings.some(n => s.includes(n)) &&
    !symbolRe.test(s)
  );
}

// ---------------------------------------------------------------------------
// Byte utilities
// ---------------------------------------------------------------------------

function readCStr(bytes, off, max) {
  let s = '';
  for (let i = 0; i < max && off + i < bytes.length; i++) {
    if (bytes[off + i] === 0) break;
    s += String.fromCharCode(bytes[off + i]);
  }
  return s;
}

function readStrAt(bytes, off, len) {
  let s = '';
  for (let i = 0; i < len && off + i < bytes.length; i++) {
    s += String.fromCharCode(bytes[off + i]);
  }
  return s;
}

module.exports = { analyzeBinary };
