/**
 * 纯 JS 的 DEFLATE / zlib 解压（用于解 PDF 的 FlateDecode 流）。
 * 小程序环境没有 node 的 zlib，也不方便引第三方包，这里按 RFC 1950/1951 实现最小可用版本。
 *
 * 覆盖范围：
 *   - zlib 容器（2 字节头 + deflate 数据 + 4 字节 adler32）
 *   - raw deflate（无容器）
 *   - deflate 的 stored（00）、fixed Huffman（01）、dynamic Huffman（10）三种块
 *
 * 不做流式/增量，一次性解压整块数据；对课表 PDF 这个体量（几十 KB）够用。
 */

/* ------------------------- 位读取器 ------------------------- */
function BitReader(bytes) {
  this.bytes = bytes;
  this.pos = 0;
  this.bitBuf = 0;
  this.bitCnt = 0;
}

BitReader.prototype.readBit = function () {
  if (this.bitCnt === 0) {
    if (this.pos >= this.bytes.length) return -1;
    this.bitBuf = this.bytes[this.pos++];
    this.bitCnt = 8;
  }
  const bit = this.bitBuf & 1;
  this.bitBuf >>= 1;
  this.bitCnt -= 1;
  return bit;
};

/** 读 n 位（低位在前），n ≤ 24 */
BitReader.prototype.readBits = function (n) {
  let value = 0;
  for (let i = 0; i < n; i += 1) {
    const bit = this.readBit();
    if (bit < 0) return -1;
    value |= bit << i;
  }
  return value;
};

/** 丢弃到字节边界 */
BitReader.prototype.alignByte = function () {
  this.bitCnt = 0;
  this.bitBuf = 0;
};

BitReader.prototype.readByte = function () {
  if (this.pos >= this.bytes.length) return -1;
  return this.bytes[this.pos++];
};

BitReader.prototype.readUint16LE = function () {
  const lo = this.readByte();
  const hi = this.readByte();
  if (lo < 0 || hi < 0) return -1;
  return lo | (hi << 8);
};

/* ------------------------- Huffman 表 ------------------------- */

/**
 * 用「码长计数 + 按码长排序的符号表」表示 Huffman 表，
 * 解码时逐位累积码值再按码长查表（快而简单，不需要建树）。
 */
function buildHuffman(lengths) {
  const maxBits = Math.max.apply(null, lengths.concat([0]));
  const blCount = new Array(maxBits + 1).fill(0);
  lengths.forEach((len) => {
    if (len > 0) blCount[len] += 1;
  });

  const nextCode = new Array(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + (blCount[bits - 1] || 0)) << 1;
    nextCode[bits] = code;
  }

  const symbols = [];
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i];
    if (len > 0) {
      symbols.push({ symbol: i, code: nextCode[len], length: len });
      nextCode[len] += 1;
    }
  }
  return { symbols, maxBits };
}

function decodeSymbol(reader, table) {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len <= table.maxBits; len += 1) {
    const bit = reader.readBit();
    if (bit < 0) return -1;
    code |= bit;
    const count = table.symbols.filter((s) => s.length === len).length;
    if (code - first < count) {
      // 在该码长内按 code - first 取对应符号
      const candidates = table.symbols.filter((s) => s.length === len);
      return candidates[code - first].symbol;
    }
    first = (first + count) << 1;
    code <<= 1;
    index += count;
  }
  return -1;
}

/* ------------------------- 长度 / 距离表 ------------------------- */

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/* ------------------------- 主解码 ------------------------- */

function inflateBlockData(reader, output, litTable, distTable) {
  for (;;) {
    const symbol = decodeSymbol(reader, litTable);
    if (symbol < 0) throw new Error("deflate 数据损坏");
    if (symbol < 256) {
      output.push(symbol);
      continue;
    }
    if (symbol === 256) return; // 块结束
    const lenIdx = symbol - 257;
    if (lenIdx < 0 || lenIdx >= LENGTH_BASE.length) throw new Error("deflate 长度码非法");
    const extraLen = LENGTH_EXTRA[lenIdx];
    const extra = extraLen ? reader.readBits(extraLen) : 0;
    if (extra < 0) throw new Error("deflate 数据提前结束");
    const length = LENGTH_BASE[lenIdx] + extra;

    const distSym = decodeSymbol(reader, distTable);
    if (distSym < 0 || distSym >= DIST_BASE.length) throw new Error("deflate 距离码非法");
    const extraDist = DIST_EXTRA[distSym];
    const distExtra = extraDist ? reader.readBits(extraDist) : 0;
    if (distExtra < 0) throw new Error("deflate 数据提前结束");
    const distance = DIST_BASE[distSym] + distExtra;
    if (distance > output.length) throw new Error("deflate 距离越界");

    const start = output.length - distance;
    for (let i = 0; i < length; i += 1) {
      output.push(output[start + i]);
    }
  }
}

function buildFixedTables() {
  const litLengths = new Array(288).fill(0);
  for (let i = 0; i < 144; i += 1) litLengths[i] = 8;
  for (let i = 144; i < 256; i += 1) litLengths[i] = 9;
  for (let i = 256; i < 280; i += 1) litLengths[i] = 7;
  for (let i = 280; i < 288; i += 1) litLengths[i] = 8;
  const distLengths = new Array(30).fill(5);
  return { litTable: buildHuffman(litLengths), distTable: buildHuffman(distLengths) };
}

function buildDynamicTables(reader) {
  const hlit = reader.readBits(5) + 257;
  const hdist = reader.readBits(5) + 1;
  const hclen = reader.readBits(4) + 4;
  if (hlit < 0 || hdist < 0 || hclen < 0) throw new Error("deflate 头损坏");

  const clenLengths = new Array(19).fill(0);
  for (let i = 0; i < hclen; i += 1) {
    const v = reader.readBits(3);
    if (v < 0) throw new Error("deflate 数据提前结束");
    clenLengths[CLEN_ORDER[i]] = v;
  }
  const clenTable = buildHuffman(clenLengths);

  const lengths = [];
  while (lengths.length < hlit + hdist) {
    const sym = decodeSymbol(reader, clenTable);
    if (sym < 0) throw new Error("deflate 码长码损坏");
    if (sym < 16) {
      lengths.push(sym);
    } else if (sym === 16) {
      const repeat = reader.readBits(2) + 3;
      const prev = lengths.length ? lengths[lengths.length - 1] : 0;
      for (let i = 0; i < repeat; i += 1) lengths.push(prev);
    } else if (sym === 17) {
      const repeat = reader.readBits(3) + 3;
      for (let i = 0; i < repeat; i += 1) lengths.push(0);
    } else {
      const repeat = reader.readBits(7) + 11;
      for (let i = 0; i < repeat; i += 1) lengths.push(0);
    }
  }

  const litLengths = lengths.slice(0, hlit);
  const distLengths = lengths.slice(hlit, hlit + hdist);
  return {
    litTable: buildHuffman(litLengths),
    distTable: buildHuffman(distLengths.length ? distLengths : new Array(1).fill(0)),
  };
}

/** 解压 raw deflate 数据（无 zlib 容器），返回 Uint8Array；失败返回 null */
function inflateRaw(bytes) {
  const reader = new BitReader(bytes);
  const output = [];
  let last = 0;
  try {
    do {
      last = reader.readBit();
      if (last < 0) throw new Error("deflate 数据为空");
      const type = reader.readBits(2);
      if (type < 0) throw new Error("deflate 头损坏");

      if (type === 0) {
        reader.alignByte();
        const len = reader.readUint16LE();
        const nlen = reader.readUint16LE();
        if (len < 0 || nlen < 0 || (len ^ 0xffff) !== nlen) throw new Error("stored 块长度校验失败");
        for (let i = 0; i < len; i += 1) {
          const b = reader.readByte();
          if (b < 0) throw new Error("stored 块数据提前结束");
          output.push(b);
        }
      } else if (type === 1) {
        const t = buildFixedTables();
        inflateBlockData(reader, output, t.litTable, t.distTable);
      } else if (type === 2) {
        const t = buildDynamicTables(reader);
        inflateBlockData(reader, output, t.litTable, t.distTable);
      } else {
        throw new Error("deflate 保留块类型");
      }
    } while (!last);
  } catch (e) {
    return null;
  }
  return new Uint8Array(output);
}

/**
 * 解压 zlib 数据（RFC 1950：2 字节头 + deflate + 4 字节 adler32）。
 * 同时也兼容「没有 zlib 头」的 raw deflate，方便容错。
 */
function inflate(bytes) {
  if (!bytes || !bytes.length) return null;

  // zlib 头判定：CMF/FLG，CM 必须是 8，且 (CMF*256+FLG) % 31 === 0
  const cmf = bytes[0];
  const flg = bytes.length > 1 ? bytes[1] : 0;
  const looksLikeZlib = (cmf & 0x0f) === 8 && ((cmf << 8) + flg) % 31 === 0;

  if (looksLikeZlib && bytes.length > 6) {
    const body = bytes.subarray(2, bytes.length - 4);
    const result = inflateRaw(body);
    if (result) return result;
  }
  // 回退：当作 raw deflate
  return inflateRaw(bytes);
}

module.exports = { inflate, inflateRaw };
