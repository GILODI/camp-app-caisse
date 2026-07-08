// Minimal zero-dependency PNG generator for PWA icons (no native deps needed).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, drawFn) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawFn(x, y, size);
      const off = rowStart + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Brand: safety-orange background, dark ticket/receipt notch mark in the center.
const ORANGE = [230, 81, 0, 255]; // #E65100
const DARK = [26, 26, 26, 255]; // #1A1A1A
const WHITE = [255, 255, 255, 255];

function draw(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const margin = size * 0.18;

  // Background
  let color = ORANGE;

  // Ticket shape: rounded rectangle with a zigzag bottom, in dark color
  const ticketLeft = margin;
  const ticketRight = size - margin;
  const ticketTop = size * 0.22;
  const ticketBottom = size * 0.78;

  if (x >= ticketLeft && x <= ticketRight && y >= ticketTop && y <= ticketBottom) {
    color = DARK;
    // Two horizontal "text lines" cut out in orange to mimic a receipt
    const lineH = size * 0.05;
    const line1 = ticketTop + size * 0.14;
    const line2 = ticketTop + size * 0.26;
    const line3 = ticketTop + size * 0.38;
    const innerLeft = ticketLeft + size * 0.08;
    const innerRight = ticketRight - size * 0.08;
    if (x >= innerLeft && x <= innerRight) {
      if (y >= line1 && y <= line1 + lineH) color = WHITE;
      if (y >= line2 && y <= line2 + lineH) color = WHITE;
      if (y >= line3 && y <= line3 + lineH * 1.6 && x <= innerLeft + (innerRight - innerLeft) * 0.55) color = WHITE;
    }
  }

  return color;
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = makePng(size, draw);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png`);
}

// Apple touch icon (no transparency needed, same art)
const applePng = makePng(180, draw);
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), applePng);
console.log("wrote apple-touch-icon.png");
