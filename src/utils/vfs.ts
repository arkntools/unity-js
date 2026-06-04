import { decompressLz4 } from '@arkntools/unity-js-tools';
import type { AssetFileNode } from '../assetFile';
import type { ArrayBufferReader } from './reader';

// ─── Bit helpers ───────────────────────────────────────────────

/** uint32 rotate right */
const rotateRight32 = (v: number, n: number): number => ((v >>> n) | (v << (32 - n))) >>> 0;

/** uint64 rotate right (bigint) */
const rotateRight64 = (v: bigint, n: number): bigint => {
  const mask = 0xffff_ffff_ffff_ffffn;
  return ((v >> BigInt(n)) | ((v << BigInt(64 - n)) & mask)) & mask;
};

/** uint64 rotate left (bigint) */
const rotateLeft64 = (v: bigint, n: number): bigint => {
  const mask = 0xffff_ffff_ffff_ffffn;
  return (((v << BigInt(n)) & mask) | (v >> BigInt(64 - n))) & mask;
};

/** uint16 rotate left */
const rotateLeft16 = (v: number, n: number): number =>
  (((v << n) | (v >>> (16 - n))) & 0xffff) >>> 0;

/** Concat two uint16 → uint32 (high, low) */
const bitConcat16 = (a: number, b: number): number => (((a & 0xffff) << 16) | (b & 0xffff)) >>> 0;

/** Concat two uint8 → uint16 (high, low) */
const bitConcat8 = (a: number, b: number): number => (((a & 0xff) << 8) | (b & 0xff)) & 0xffff;

/** Concat two uint32 → uint64 bigint (high, low) */
const bitConcat32 = (a: number, b: number): bigint => (BigInt(a >>> 0) << 32n) | BigInt(b >>> 0);

// ─── VFS Header ────────────────────────────────────────────────

export interface VFSHeader {
  signature: string;
  version: number;
  unityVersion: string;
  unityReversion: string;
  size: number;
  compressedBlocksInfoSize: number;
  uncompressedBlocksInfoSize: number;
  flags: number;
  encFlags: number;
}

export interface VFSStorageBlock {
  compressedSize: number;
  uncompressedSize: number;
  flags: number;
}

// ─── ArchiveFlags (same as BundleFile) ─────────────────────────

export const ARCHIVE_BLOCKS_INFO_AT_THE_END = 0x80;
export const ARCHIVE_BLOCK_INFO_NEED_PADDING_AT_START = 0x200;

// ─── IsValidHeader ─────────────────────────────────────────────

export function isValidVFSHeader(data: ArrayBuffer, offset = 0): boolean {
  if (data.byteLength - offset < 8) return false;
  const view = new DataView(data);
  const a = view.getUint32(offset, false); // big-endian
  const b = view.getUint32(offset + 4, false);

  const t = (a ^ 0x4a92f0cd) >>> 0;
  const c1 = ((4 * t) & 0xffff0000) >>> 0;
  const c2 = rotateRight32(t, 14);
  const c3 = (c1 ^ c2 ^ 0xd8b1e637) >>> 0;
  return b === c3;
}

// ─── ReadHeader ────────────────────────────────────────────────

export function readVFSHeader(r: ArrayBufferReader): VFSHeader {
  // All reads here are big-endian
  const compressedBlocksInfoSize2 = r.readUInt16BE();
  const flags2 = r.readUInt32BE();
  const rawEncFlags = r.readUInt32BE();
  const size2 = r.readUInt32BE();
  const flags1 = r.readUInt32BE();
  const uncompressedBlocksInfoSize1 = r.readUInt16BE();
  r.readUInt32BE(); // unknown
  const uncompressedBlocksInfoSize2 = r.readUInt16BE();
  const size1 = r.readUInt32BE();
  const compressedBlocksInfoSize1 = r.readUInt16BE();
  r.readUInt8(); // unknown byte

  // descramble
  let cbs = bitConcat16(
    (compressedBlocksInfoSize1 ^ compressedBlocksInfoSize2 ^ 0xa121) & 0xffff,
    compressedBlocksInfoSize2,
  );
  cbs = (rotateRight32(cbs, 18) ^ 0xf74324ee) >>> 0;

  let ucbs = bitConcat16(
    (uncompressedBlocksInfoSize1 ^ uncompressedBlocksInfoSize2 ^ 0xa121) & 0xffff,
    uncompressedBlocksInfoSize2,
  );
  ucbs = (rotateRight32(ucbs, 18) ^ 0xf74324ee) >>> 0;

  let size64 = bitConcat32((size1 ^ size2 ^ 0xdad76848) >>> 0, size2);
  size64 = rotateRight64(size64, 18) ^ 0xa4f1a11747816520n;

  const encFlags = (rawEncFlags ^ flags2) >>> 0;
  const flags = (flags1 ^ flags2 ^ 0xa7f49310) >>> 0;

  return {
    signature: 'UnityFS',
    version: 6,
    unityVersion: '5.x.x',
    unityReversion: '2021.3.3f5',
    size: Number(size64 & 0xffff_ffffn), // truncate to uint32
    compressedBlocksInfoSize: cbs,
    uncompressedBlocksInfoSize: ucbs,
    flags,
    encFlags,
  };
}

// ─── ReadBlocksInfos ───────────────────────────────────────────

export function readVFSBlocksInfos(r: ArrayBufferReader): VFSStorageBlock[] {
  // The encCount is read LE then reversed then XOR'd
  // Reading LE uint32 then reverse-endianness == reading BE uint32
  // So: encCount = ReverseEndianness(LE_read ^ 0x8A7BF723)
  // LE_read is the raw 4 bytes as little-endian uint32
  const leVal = r.readUInt32LE();
  const xored = (leVal ^ 0x8a7bf723) >>> 0;
  // ReverseEndianness on uint32: swap all 4 bytes
  const encCount =
    (((xored & 0xff) << 24) |
      (((xored >>> 8) & 0xff) << 16) |
      (((xored >>> 16) & 0xff) << 8) |
      ((xored >>> 24) & 0xff)) >>>
    0;

  const low = encCount & 0xffff;
  const high = (encCount >>> 16) & 0xffff;
  let blocksCount = bitConcat16((low ^ high) & 0xffff, low);
  blocksCount = (rotateRight32(blocksCount, 18) ^ 0x91ce0a4f) >>> 0;

  const blocks: VFSStorageBlock[] = [];

  for (let i = 0; i < blocksCount; i++) {
    const a = r.readUInt16BE();
    const b = r.readUInt16BE();
    const c = r.readUInt16BE();
    const rawEncFlags = (r.readUInt16BE() ^ 0x9cd6) & 0xffff;
    const d = r.readUInt16BE();

    const a0 = rawEncFlags & 0xff;
    const a1 = (rawEncFlags >>> 8) & 0xff;

    let flagsVal = bitConcat8(a0 ^ a1, a0);
    flagsVal = (c ^ rotateLeft16(flagsVal, 14) ^ 0x523f) & 0xffff;

    let uncompressedSize = bitConcat16((a ^ c ^ 0xa121) & 0xffff, c);
    uncompressedSize = (rotateRight32(uncompressedSize, 18) ^ 0xf74324ee) >>> 0;

    let compressedSize = bitConcat16((b ^ d ^ 0xa121) & 0xffff, d);
    compressedSize = (rotateRight32(compressedSize, 18) ^ 0xf74324ee) >>> 0;

    blocks.push({ flags: flagsVal, uncompressedSize, compressedSize });
  }

  return blocks;
}

// ─── ReadDirectoryInfos ────────────────────────────────────────

export function readVFSDirectoryInfos(r: ArrayBufferReader): AssetFileNode[] {
  // Same pattern as blocks count
  const leVal = r.readUInt32LE();
  const xored = (leVal ^ 0x5de50a6b) >>> 0;
  const encCount =
    (((xored & 0xff) << 24) |
      (((xored >>> 8) & 0xff) << 16) |
      (((xored >>> 16) & 0xff) << 8) |
      ((xored >>> 24) & 0xff)) >>>
    0;

  const low = encCount & 0xffff;
  const high = (encCount >>> 16) & 0xffff;
  let nodesCount = bitConcat16((low ^ high) & 0xffff, low);
  nodesCount = (rotateRight32(nodesCount, 18) ^ 0xe4c1d9f2) >>> 0;

  const nodes: AssetFileNode[] = [];

  for (let i = 0; i < nodesCount; i++) {
    const a = (r.readUInt32BE() ^ 0x8e06a9f8) >>> 0;
    const b = r.readUInt32BE();
    const c = r.readUInt32BE();
    const d = r.readUInt32BE();

    // read name (up to 64 bytes, null-terminated)
    const nameBytes: number[] = [];
    for (let j = 0; j < 64; j++) {
      if (r.position >= r.length) break;
      const bt = r.readUInt8();
      if (bt === 0) break;
      nameBytes.push(bt);
    }

    // decrypt name
    for (let j = 0; j < nameBytes.length; j++) {
      nameBytes[j] ^= (j ^ 0x97) & 0xff;
    }
    const name = String.fromCharCode(...nameBytes);

    // read 'e'
    const e = r.readUInt32BE();

    // descramble
    const a0 = a & 0xffff;
    const a1 = (a >>> 16) & 0xffff;

    let flagsVal = bitConcat16((a1 ^ a0) & 0xffff, a0);
    flagsVal = (rotateRight32(flagsVal, 18) ^ 0xf13927c4 ^ b) >>> 0;

    let offset64 = bitConcat32((d ^ c ^ 0xdad76848) >>> 0, c);
    offset64 = rotateLeft64(offset64, 14) ^ 0xa4f1a11747816520n;

    let size64 = bitConcat32((b ^ e ^ 0xdad76848) >>> 0, e);
    size64 = rotateLeft64(size64, 14) ^ 0xa4f1a11747816520n;

    nodes.push({
      path: name,
      flags: flagsVal,
      offset: Number(offset64),
      size: Number(size64),
    });
  }

  return nodes;
}

// ─── VFSAES ────────────────────────────────────────────────────

const VFS_SBOX = new Uint8Array([
  0xe4, 0xb9, 0x45, 0x07, 0x92, 0x82, 0x2f, 0x43, 0xf5, 0xc9, 0x22, 0x25, 0xa9, 0x4f, 0x46, 0x6d,
  0x4a, 0x71, 0x8b, 0x6c, 0x8c, 0xeb, 0xb2, 0xac, 0xcf, 0x0c, 0x9e, 0x01, 0x38, 0x32, 0xd3, 0x93,
  0x98, 0x63, 0xda, 0x96, 0xe5, 0xc4, 0xc3, 0x6b, 0x7f, 0x26, 0x72, 0xd7, 0x97, 0xd5, 0x80, 0xbc,
  0x5d, 0xbb, 0x55, 0x67, 0x10, 0x73, 0xb3, 0x8d, 0xe2, 0x35, 0x29, 0x47, 0xa8, 0x60, 0x3f, 0xc5,
  0xef, 0x68, 0xec, 0xbe, 0xab, 0xc6, 0xb8, 0x5c, 0xd8, 0x15, 0x09, 0x54, 0xf3, 0x7a, 0x40, 0xa2,
  0x30, 0x0a, 0xdc, 0x53, 0xfa, 0xdb, 0xf1, 0x78, 0xde, 0xad, 0xf0, 0xb5, 0xc1, 0x81, 0x9f, 0x3e,
  0x83, 0x90, 0x31, 0xf2, 0xfb, 0x21, 0x28, 0x85, 0x06, 0xca, 0xcd, 0x1e, 0xd4, 0x3c, 0xa0, 0xc8,
  0x23, 0x16, 0x6e, 0x89, 0x1d, 0xe7, 0xee, 0x5e, 0x42, 0xbd, 0xcb, 0x13, 0x50, 0xa6, 0x4e, 0x49,
  0x58, 0xdf, 0x2c, 0x84, 0x87, 0xb6, 0x91, 0x52, 0xdd, 0x19, 0xf9, 0x2b, 0x4d, 0x77, 0xba, 0x04,
  0xa5, 0x41, 0xce, 0x94, 0x3d, 0x5f, 0xfc, 0x9b, 0x79, 0x9a, 0x7e, 0x65, 0x5a, 0xb1, 0x66, 0x34,
  0x56, 0xa7, 0x1a, 0xbf, 0xea, 0x7d, 0x27, 0x0b, 0x59, 0x2e, 0xae, 0x14, 0x33, 0xc0, 0x51, 0x39,
  0xc7, 0x3a, 0x2a, 0x9d, 0xf4, 0x7c, 0xcc, 0xd1, 0xd6, 0x70, 0x37, 0x0e, 0x75, 0x02, 0x1b, 0xe3,
  0xe9, 0x48, 0x0d, 0x24, 0x2d, 0xf7, 0xd2, 0xb7, 0xaf, 0xa3, 0xa1, 0x64, 0x7b, 0xed, 0xf8, 0x05,
  0x95, 0x3b, 0x74, 0xfd, 0x62, 0xd0, 0x0f, 0xff, 0x4b, 0xaa, 0x88, 0x5b, 0x03, 0xb4, 0xe8, 0x9c,
  0xb0, 0x17, 0x1c, 0x76, 0x57, 0xe0, 0xa4, 0x44, 0x20, 0xd9, 0x8e, 0x11, 0x86, 0x69, 0x36, 0xfe,
  0x4c, 0x6f, 0x61, 0x6a, 0x8f, 0xe1, 0x18, 0x8a, 0x12, 0x99, 0xe6, 0x1f, 0x00, 0x08, 0xf6, 0xc2,
]);

const VFS_KEY = new Uint8Array([
  0x3a, 0xf1, 0x8c, 0x47, 0xb2, 0x09, 0x6d, 0xee, 0x51, 0x24, 0x90, 0x7c, 0x18, 0xd3, 0xa4, 0x62,
]);

const VFS_IV = new Uint8Array([
  0xc7, 0x12, 0x5e, 0xa9, 0x04, 0xdb, 0x33, 0x88, 0xf2, 0x0e, 0x77, 0x49, 0x65, 0xba, 0x1c, 0x93,
]);

const VFS_XOR_KEY = 0xf19ab7752cdd0196n;

const RCON = new Uint8Array([
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a,
  0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5, 0x91, 0x39,
]);

function xTime(a: number): number {
  return (a & 0x80) !== 0 ? ((a << 1) ^ 0x1b) & 0xff : (a << 1) & 0xff;
}

function mixSingleColumn(a: Uint8Array<ArrayBuffer>): void {
  const t = a[0] ^ a[1] ^ a[2] ^ a[3];
  const u = a[0];
  a[0] ^= t ^ xTime((a[0] ^ a[1]) & 0xff);
  a[1] ^= t ^ xTime((a[1] ^ a[2]) & 0xff);
  a[2] ^= t ^ xTime((a[2] ^ a[3]) & 0xff);
  a[3] ^= t ^ xTime((a[3] ^ u) & 0xff);
}

type State = Uint8Array<ArrayBuffer>[]; // 4 columns, each 4 bytes

function bytesToMatrix(text: Uint8Array<ArrayBuffer>): State {
  const rows: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < text.length; i += 4) {
    rows.push(new Uint8Array([text[i], text[i + 1], text[i + 2], text[i + 3]]));
  }
  return rows;
}

function matrixToBytes(m: State): Uint8Array<ArrayBuffer> {
  const r = new Uint8Array(16);
  let idx = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      r[idx++] = m[i][j];
    }
  }
  return r;
}

function subBytes(s: State): void {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s[i][j] = VFS_SBOX[s[i][j]];
}

function shiftRows(s: State): void {
  // row 1: shift left by 1
  [s[0][1], s[1][1], s[2][1], s[3][1]] = [s[1][1], s[2][1], s[3][1], s[0][1]];
  // row 2: shift left by 2
  [s[0][2], s[1][2], s[2][2], s[3][2]] = [s[2][2], s[3][2], s[0][2], s[1][2]];
  // row 3: shift left by 3
  [s[0][3], s[1][3], s[2][3], s[3][3]] = [s[3][3], s[0][3], s[1][3], s[2][3]];
}

function addRoundKey(s: State, k: Uint8Array<ArrayBuffer>[]): void {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s[i][j] ^= k[i][j];
}

function mixColumns(s: State): void {
  for (let i = 0; i < 4; i++) mixSingleColumn(s[i]);
}

function expandKey(): Uint8Array<ArrayBuffer>[][] {
  const nRounds = 10;
  const keyCols = bytesToMatrix(VFS_KEY);
  const iterSize = VFS_KEY.length / 4;
  let rconIdx = 1;

  while (keyCols.length < (nRounds + 1) * 4) {
    const word = new Uint8Array(keyCols[keyCols.length - 1]);

    if (keyCols.length % iterSize === 0) {
      // rotate left by 1
      const first = word[0];
      word[0] = word[1];
      word[1] = word[2];
      word[2] = word[3];
      word[3] = first;
      // sbox
      for (let k = 0; k < 4; k++) word[k] = VFS_SBOX[word[k]];
      word[0] ^= RCON[rconIdx];
      rconIdx++;
    }

    const prev = keyCols[keyCols.length - iterSize];
    for (let k = 0; k < 4; k++) word[k] ^= prev[k];
    keyCols.push(word);
  }

  // group into 4×4 round key matrices (column-major indexing for AddRoundKey)
  const res: Uint8Array<ArrayBuffer>[][] = [];
  for (let x = 0; x < keyCols.length / 4; x++) {
    const m: Uint8Array<ArrayBuffer>[] = [];
    for (let c = 0; c < 4; c++) {
      m.push(
        new Uint8Array([
          keyCols[x * 4 + c][0],
          keyCols[x * 4 + c][1],
          keyCols[x * 4 + c][2],
          keyCols[x * 4 + c][3],
        ]),
      );
    }
    res.push(m);
  }
  return res;
}

function encryptBlock(plaintext: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const keyMats = expandKey();
  const nRounds = 10;
  const state = bytesToMatrix(plaintext);

  addRoundKey(state, keyMats[0]);

  for (let rr = 1; rr < nRounds; rr++) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, keyMats[rr]);
  }

  subBytes(state);
  shiftRows(state);
  addRoundKey(state, keyMats[keyMats.length - 1]);

  return matrixToBytes(state);
}

function vfsAESDecrypt(ciphertext: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const blocks: Uint8Array<ArrayBuffer>[] = [];
  let previous = new Uint8Array(VFS_IV);

  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const ct = ciphertext.subarray(offset, Math.min(offset + 16, ciphertext.length));

    // encrypt IV to get keystream
    const block = encryptBlock(previous);

    // xor keystream with ciphertext
    const pt = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) pt[i] = ct[i] ^ block[i];
    blocks.push(pt);

    // derive next IV
    const nextIv = new Uint8Array(16);
    let count = 0;
    for (let i = 0; i < 16; i++) {
      const shiftSrc = VFS_XOR_KEY >> BigInt(count & 0x38);
      let temp = (block[i] ^ (31 * i) ^ Number(shiftSrc & 0xffn)) & 0xff;
      count += 8;
      temp = ((temp >>> 5) | (8 * temp)) & 0xff;
      temp = VFS_SBOX[temp];
      nextIv[i] = temp;
    }
    previous = nextIv;
  }

  // flatten
  const total = blocks.reduce((s, b) => s + b.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const b of blocks) {
    result.set(b, pos);
    pos += b.length;
  }
  return result;
}

// ─── DecryptBlock ──────────────────────────────────────────────

export function decryptVFSBlock(buffer: Uint8Array<ArrayBuffer>): void {
  if (buffer.length <= 256) {
    const dec = vfsAESDecrypt(buffer);
    buffer.set(dec.subarray(0, buffer.length));
  } else {
    const numBlocksFloor = Math.floor(buffer.length / 16);
    let step = Math.floor(256 / numBlocksFloor);
    if (numBlocksFloor > 256) step = 1;

    const decBuffer = new Uint8Array(256);

    const count = Math.min(numBlocksFloor, 256);
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < step; j++) {
        decBuffer[i * step + j] = buffer[i * 16 + j];
      }
    }

    const decrypted = vfsAESDecrypt(decBuffer);

    for (let i = 0; i < count; i++) {
      for (let j = 0; j < step; j++) {
        buffer[i * 16 + j] = decrypted[i * step + j];
      }
    }
  }
}

// ─── LZ4Inv decompress ────────────────────────────────────────

function lz4InvGetLength(length: number, cmp: Uint8Array<ArrayBuffer>, pos: { v: number }): number {
  if (length === 0xf) {
    let sum: number;
    do {
      sum = cmp[pos.v++];
      length += sum;
    } while (sum === 0xff);
  }
  return length;
}

export function decompressLz4Inv(
  compressed: Uint8Array<ArrayBuffer>,
  uncompressedSize: number,
): Uint8Array<ArrayBuffer> {
  const dec = new Uint8Array(uncompressedSize);
  const pos = { v: 0 };
  let decPos = 0;

  do {
    const val = compressed[pos.v++];
    const lit = val & 0b00110011;
    const enc = val & 0b11001100;
    let litCount = (lit & 0b11) | (lit >> 2);
    let encCount = ((enc >> 2) & 0b11) | (enc >> 4);

    // copy literal chunk
    litCount = lz4InvGetLength(litCount, compressed, pos);
    compressed.subarray(pos.v, pos.v + litCount).forEach((b, i) => {
      dec[decPos + i] = b;
    });
    pos.v += litCount;
    decPos += litCount;

    if (pos.v >= compressed.length) break;

    // copy compressed chunk (big-endian offset)
    const back = (compressed[pos.v++] << 8) | compressed[pos.v++];
    encCount = lz4InvGetLength(encCount, compressed, pos) + 4;

    let encPos = decPos - back;
    if (encCount <= back) {
      for (let i = 0; i < encCount; i++) dec[decPos + i] = dec[encPos + i];
      decPos += encCount;
    } else {
      while (encCount-- > 0) {
        dec[decPos++] = dec[encPos++];
      }
    }
  } while (pos.v < compressed.length && decPos < dec.length);

  return dec;
}

// ─── High-level: decompress blocks info (standard LZ4) ────────

export function decompressVFSBlocksInfo(
  compressedData: Uint8Array<ArrayBuffer>,
  flags: number,
  uncompressedSize: number,
): Uint8Array<ArrayBuffer> {
  if ((flags & 0x3f) !== 0) {
    // encrypted + compressed
    decryptVFSBlock(compressedData);
    return decompressLz4(compressedData, uncompressedSize) as Uint8Array<ArrayBuffer>;
  }
  return compressedData;
}
