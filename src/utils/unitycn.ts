import crypto from 'crypto';
import type BufferReader from 'buffer-reader';
import { createUint8ArraySlice, toUint4Array } from './buffer';

interface DecryptState {
  offset: number;
  index: number;
}

const SIGNATURE = '#$unity3dchina!@';

export class UnityCN {
  private readonly key: Buffer;
  private readonly indexTable: Uint8Array;
  private readonly subTable = new Uint8Array(0x10);

  public constructor(r: BufferReader, keyHex: string) {
    this.key = Buffer.from(keyHex, 'hex');

    r.move(4);

    const infoBytes = r.nextBuffer(0x10);
    const infoKey = r.nextBuffer(0x10);
    r.move(1);

    const signatureBytes = r.nextBuffer(0x10);
    const signatureKey = r.nextBuffer(0x10);
    r.move(1);

    const signature = this.decryptKey(signatureKey, signatureBytes).toString('utf8');
    if (signature !== SIGNATURE) {
      throw new Error(`Invalid signature, expected "${SIGNATURE}" but got "${signature}"`);
    }

    const info = toUint4Array(this.decryptKey(infoKey, infoBytes));
    this.indexTable = info.subarray(0, 0x10);
    const sub = info.subarray(0x10, 0x20);
    for (let i = 0; i < sub.length; i++) {
      const idx = Math.floor((i % 4) * 4 + i / 4);
      this.subTable[idx] = sub[i];
    }
  }

  // 太怪了，明明是加密但是作用是解密，到底是什么科技
  private encryptWithKey(data: Buffer) {
    const cipher = crypto.createCipheriv('aes-128-ecb', this.key, null);
    return Buffer.concat([cipher.update(data), cipher.final()]);
  }

  private decryptKey(key: Buffer, data: Buffer) {
    key = this.encryptWithKey(key);
    const result = Uint8Array.from(data);
    for (let i = 0; i < 0x10; i++) {
      result[i] ^= key[i];
    }
    return Buffer.from(result);
  }

  private decryptByte(bytes: Uint8Array, state: DecryptState) {
    let b =
      this.subTable[((state.index >> 2) & 3) + 4] +
      this.subTable[state.index & 3] +
      this.subTable[((state.index >> 4) & 3) + 8] +
      this.subTable[((state.index >> 6) & 3) + 12];
    bytes[state.offset] =
      (((this.indexTable[bytes[state.offset] & 0xf] - b) & 0xf) |
        (0x10 * (this.indexTable[bytes[state.offset] >> 4] - b))) &
      0xff;
    b = bytes[state.offset];
    state.offset++;
    state.index++;
    return b;
  }

  public decryptBlock(bytes: Uint8Array, index: number) {
    const size = bytes.length;
    for (let offset = 0; offset < size; ) {
      offset += this.decrypt(createUint8ArraySlice(bytes, offset), index++, size - offset);
    }
  }

  private decrypt(bytes: Uint8Array, index: number, remaining: number) {
    const state: DecryptState = {
      offset: 0,
      index,
    };

    const curByte = this.decryptByte(bytes, state);
    let byteHigh = curByte >> 4;
    const byteLow = curByte & 0xf;

    if (byteHigh === 0xf) {
      let b: number;
      do {
        b = this.decryptByte(bytes, state);
        byteHigh += b;
      } while (b === 0xff);
    }

    state.offset += byteHigh;

    if (state.offset < remaining) {
      this.decryptByte(bytes, state);
      this.decryptByte(bytes, state);
      if (byteLow === 0xf) {
        let b: number;
        do {
          b = this.decryptByte(bytes, state);
        } while (b === 0xff);
      }
    }

    return state.offset;
  }
}
