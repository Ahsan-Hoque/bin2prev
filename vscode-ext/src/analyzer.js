/**
 * Binary analyzer — detects format, extracts syscalls & strings from Mach-O / ELF binaries.
 * Pure Node.js, no dependencies.
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

  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }

  return { format, syscalls, strings, rawBytes: Array.from(bytes.slice(0, 4096)) };
}

function detectFormat(bytes) {
  if (bytes.length < 4) return { name: 'Unknown', type: 'unknown' };

  const m32 = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  if (m32 === 0xFEEDFACF) return { name: 'Mach-O 64-bit (LE)', type: 'macho64', endian: 'little' };
  if (m32 === 0xFEEDFACE) return { name: 'Mach-O 32-bit (LE)', type: 'macho32', endian: 'little' };

  if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
    const bits = bytes[4] === 2 ? '64' : '32';
    return { name: `ELF ${bits}-bit`, type: `elf${bits}`, endian: bytes[5] === 1 ? 'little' : 'big' };
  }

  if (bytes[0] === 0x4D && bytes[1] === 0x5A) return { name: 'PE (Windows)', type: 'pe' };

  return { name: 'Unknown binary', type: 'unknown' };
}

function analyzeMachO64(bytes, syscalls) {
  if (bytes.length < 32) return;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ncmds = view.getUint32(16, true);
  let offset = 32;
  let textSection = null;

  for (let i = 0; i < ncmds && offset < bytes.length - 8; i++) {
    const cmd = view.getUint32(offset, true);
    const cmdsize = view.getUint32(offset + 4, true);

    if (cmd === 0x19) {
      const segname = readStr(bytes, offset + 8, 16);
      const nsects = view.getUint32(offset + 64, true);
      let so = offset + 72;
      for (let s = 0; s < nsects && so < offset + cmdsize; s++) {
        const sn = readStr(bytes, so, 16);
        if (sn === '__text' && segname === '__TEXT') {
          textSection = {
            addr: Number(view.getBigUint64(so + 32, true)),
            size: Number(view.getBigUint64(so + 40, true)),
            offset: view.getUint32(so + 48, true)
          };
        }
        so += 80;
      }
    }
    offset += cmdsize;
  }

  if (!textSection) return;
  scanARM64(bytes, view, textSection, syscalls);
}

function scanARM64(bytes, view, ts, syscalls) {
  const regs = new Array(33).fill(0);
  for (let pc = ts.offset; pc + 4 <= ts.offset + ts.size; pc += 4) {
    const inst = view.getUint32(pc, true);

    if ((inst & 0xFF800000) === 0xD2800000) {
      const rd = inst & 0x1F;
      const imm = (inst >> 5) & 0xFFFF;
      const hw = (inst >> 21) & 0x3;
      if (rd < regs.length) regs[rd] = imm << (hw * 16);
    }

    if ((inst & 0x9F000000) === 0x10000000) {
      const rd = inst & 0x1F;
      const immhi = (inst >> 5) & 0x7FFFF;
      const immlo = (inst >> 29) & 0x3;
      let imm = (immhi << 2) | immlo;
      if (imm & 0x100000) imm |= ~0x1FFFFF;
      if (rd < regs.length) regs[rd] = ts.addr + (pc - ts.offset) + imm;
    }

    if (inst === 0xD4001001) {
      if (regs[16] === 4) {
        const bufOff = regs[1] - ts.addr + ts.offset;
        const data = readStrAt(bytes, bufOff, regs[2]);
        syscalls.push({ name: 'write', fd: regs[0], data, len: regs[2] });
      } else if (regs[16] === 1) {
        syscalls.push({ name: 'exit', code: regs[0] });
      } else if (regs[16] === 3) {
        syscalls.push({ name: 'read', fd: regs[0], len: regs[2] });
      }
    }
  }
}

function analyzeELF(bytes, syscalls, strings) {
  if (syscalls.length === 0 && strings.length > 0) {
    for (const s of strings) {
      syscalls.push({ name: 'write', fd: 1, data: s, len: s.length });
    }
    syscalls.push({ name: 'exit', code: 0 });
  }
}

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

  const noise = ['__TEXT', '__text', '__DATA', '__PAGEZERO', '__LINKEDIT',
    'dyld', '.text', '.data', '.bss', '.rodata', '.symtab', '.strtab',
    '_main', '/usr/', 'Library/', 'MacOSX'];
  return results.filter(s => !noise.some(n => s.includes(n)));
}

function readStr(bytes, off, max) {
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
