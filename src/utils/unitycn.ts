import { aesEcbEncrypt } from './aes';
import { bufferToString, hexToUInt8Array, toUInt4Array } from './buffer';
import type { ArrayBufferReader } from './reader';

interface DecryptState {
  offset: number;
  index: number;
}

const SIGNATURE = '#$unity3dchina!@';

export class UnityCN {
  private readonly key: Uint8Array;
  private readonly indexTable: Uint8Array;
  private readonly subTable = new Uint8Array(0x10);

  public constructor(r: ArrayBufferReader, keyHex: string) {
    this.key = hexToUInt8Array(keyHex);

    r.move(4);

    const infoBytes = r.readBuffer(0x10);
    const infoKey = r.readBuffer(0x10);
    r.move(1);

    const signatureBytes = r.readBuffer(0x10);
    const signatureKey = r.readBuffer(0x10);
    r.move(1);

    const signature = bufferToString(this.decryptKey(signatureKey, signatureBytes));
    if (signature !== SIGNATURE) {
      throw new Error(`Invalid signature, expected "${SIGNATURE}" but got "${signature}"`);
    }

    const info = toUInt4Array(this.decryptKey(infoKey, infoBytes));
    this.indexTable = info.subarray(0, 0x10);
    const sub = info.subarray(0x10, 0x20);
    for (let i = 0; i < sub.length; i++) {
      const idx = Math.floor((i % 4) * 4 + i / 4);
      this.subTable[idx] = sub[i];
    }
  }

  // 太怪了，明明是加密但是作用是解密，到底是什么科技
  private encryptWithKey(data: ArrayBuffer) {
    return aesEcbEncrypt(data, this.key);
  }

  private decryptKey(key: ArrayBuffer, data: ArrayBuffer) {
    const encryptedKey = this.encryptWithKey(key);
    const result = new Uint8Array(data);
    for (let i = 0; i < 0x10; i++) {
      result[i] ^= encryptedKey[i];
    }
    return result;
  }

  private decryptByte(bytes: Uint8Array, state: DecryptState) {
    const b =
      this.subTable[((state.index >> 2) & 3) + 4] +
      this.subTable[state.index & 3] +
      this.subTable[((state.index >> 4) & 3) + 8] +
      this.subTable[((state.index >> 6) & 3) + 12];
    const curVal = bytes[state.offset];
    const newVal =
      (((this.indexTable[curVal & 0xf] - b) & 0xf) | (0x10 * (this.indexTable[curVal >> 4] - b))) &
      0xff;
    bytes[state.offset] = newVal;
    state.offset++;
    state.index++;
    return newVal;
  }

  public decryptBlock(bytes: ArrayBuffer, index: number) {
    const size = bytes.byteLength;
    for (let offset = 0; offset < size; ) {
      offset += this.decrypt(new Uint8Array(bytes, offset), index++, size - offset);
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
