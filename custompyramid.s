// custompyramid.s — ARM64 macOS direct-syscall custom pyramid
//
// Reads a decimal number N (1–100) from stdin, then prints an N-row
// centred star pyramid on stdout.
//
// Syscalls (BSD convention, x16 = number):
//   3 = read(fd, buf, len)
//   4 = write(fd, buf, len)
//   1 = exit(code)
//
// Stack layout (256 B total):
//   [sp+ 0]  N       (uint64) — number of rows
//   [sp+ 8]  i       (uint64) — current row, 1-indexed
//   [sp+16]  inbuf   (8 B)   — raw bytes read from stdin
//   [sp+32]  rowbuf  (224 B) — assembled output row (max 200 chars)

.section __TEXT,__text,regular,pure_instructions
.globl  _main
.align  2

_main:
    sub     sp,  sp,  #256

    // ── write prompt ─────────────────────────────────────────────────────
    // ADR forward-references Lprompt (placed after exit svc below)
    adr     x1,  Lprompt
    mov     x0,  #1                 // fd = stdout
    mov     x2,  #14                // len("Rows (1-100): ")
    mov     x16, #4                 // SYS_write
    svc     #0x80

    // ── read N from stdin ────────────────────────────────────────────────
    mov     x0,  #0                 // fd = stdin
    add     x1,  sp,  #16          // inbuf on stack
    mov     x2,  #8                 // max 8 bytes
    mov     x16, #3                 // SYS_read
    svc     #0x80                   // x0 = bytes_read

    // ── parse decimal string → N  (x9 = result) ─────────────────────────
    mov     x12, x0                 // save bytes_read
    mov     x9,  #0                 // result = 0
    add     x1,  sp,  #16          // point at inbuf
    mov     x10, #0                 // index = 0
Lparse:
    cmp     x10, x12
    bge     Lclamp
    ldrb    w11, [x1, x10]
    cmp     w11, #0x30              // < '0'?
    blt     Lclamp
    cmp     w11, #0x39              // > '9'?
    bgt     Lclamp
    add     x9,  x9,  x9, lsl #2   // x9 *= 5
    lsl     x9,  x9,  #1           // x9 *= 2  → total ×10
    sub     w11, w11, #0x30         // digit value
    add     x9,  x9,  x11
    add     x10, x10, #1
    b       Lparse

    // ── clamp N to [1, 100] ───────────────────────────────────────────────
Lclamp:
    cmp     x9,  #1
    bge     Lchkmax
    mov     x9,  #1
    b       Lstart
Lchkmax:
    cmp     x9,  #100
    ble     Lstart
    mov     x9,  #100

Lstart:
    str     x9,  [sp, #0]           // save N
    mov     x8,  #1
    str     x8,  [sp, #8]           // i = 1

    // ── row loop ──────────────────────────────────────────────────────────
Lrow:
    ldr     x9,  [sp, #0]           // N
    ldr     x8,  [sp, #8]           // i
    cmp     x8,  x9
    bgt     Ldone

    sub     x5,  x9,  x8            // spaces = N - i
    lsl     x4,  x8,  #1
    sub     x4,  x4,  #1            // stars  = 2i - 1

    add     x6,  sp,  #32           // rowbuf base address
    mov     x7,  #0                 // write position

    // fill spaces
Lspaces:
    cmp     x7,  x5
    bge     Lstars
    mov     w11, #0x20              // ' '
    strb    w11, [x6, x7]
    add     x7,  x7,  #1
    b       Lspaces

    // fill stars
Lstars:
    mov     x3,  #0
Lstars2:
    cmp     x3,  x4
    bge     Lnl
    mov     w11, #0x2A              // '*'
    add     x13, x7,  x3
    strb    w11, [x6, x13]
    add     x3,  x3,  #1
    b       Lstars2

    // append newline, then write the completed row
Lnl:
    add     x7,  x7,  x3           // pos  = spaces + stars
    mov     w11, #0x0A             // '\n'
    strb    w11, [x6, x7]
    add     x7,  x7,  #1           // len  = spaces + stars + 1

    mov     x0,  #1                // fd = stdout
    add     x1,  sp,  #32          // rowbuf
    add     x2,  x7,  #0           // len (ADD-imm so static analyzer can track x2)
    mov     x16, #4                // SYS_write
    svc     #0x80

    ldr     x8,  [sp, #8]
    add     x8,  x8,  #1
    str     x8,  [sp, #8]
    b       Lrow

    // ── exit ──────────────────────────────────────────────────────────────
Ldone:
    add     sp,  sp,  #256
    mov     x0,  #0
    mov     x16, #1
    svc     #0x80                   // static scanner breaks here; bytes below are data

// Prompt literal — lives after the exit svc so the scanner never decodes
// these bytes as instructions.
Lprompt:
    .ascii  "Rows (1-100): "
