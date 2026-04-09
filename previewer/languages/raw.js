export const name = 'Raw Binary';

export function generate(analysis) {
  // We receive the raw bytes via analysis._bytes
  const bytes = analysis._bytes;
  if (!bytes) return '<span class="cm">No raw bytes available</span>';

  const lines = [];
  lines.push('<span class="cm">// Raw binary content — hex dump with ASCII</span>');
  lines.push('<span class="cm">// Offset    00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F  |ASCII           |</span>');
  lines.push('');

  const total = Math.min(bytes.length, 4096); // show first 4KB
  for (let i = 0; i < total; i += 16) {
    const offset = '<span class="num">' + i.toString(16).padStart(8, '0') + '</span>';
    let hex1 = '', hex2 = '', ascii = '';

    for (let j = 0; j < 16; j++) {
      if (i + j < bytes.length) {
        const b = bytes[i + j];
        const h = b.toString(16).padStart(2, '0');
        const span = (b === 0) ? '<span class="cm">' + h + '</span>' : '<span class="str">' + h + '</span>';
        if (j < 8) hex1 += span + ' ';
        else hex2 += span + ' ';
        ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '<span class="cm">.</span>';
      } else {
        if (j < 8) hex1 += '   ';
        else hex2 += '   ';
        ascii += ' ';
      }
    }

    lines.push(offset + '  ' + hex1 + ' ' + hex2 + ' <span class="cm">|</span>' + ascii + '<span class="cm">|</span>');
  }

  if (bytes.length > total) {
    lines.push('');
    lines.push('<span class="cm">... truncated (' + bytes.length.toLocaleString() + ' bytes total, showing first ' + total.toLocaleString() + ')</span>');
  }

  lines.push('');
  lines.push('<span class="cm">// Total size: ' + bytes.length.toLocaleString() + ' bytes</span>');

  return lines.join('\n');
}
