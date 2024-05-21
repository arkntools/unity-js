import crypto from 'crypto';
import type BufferReader from 'buffer-reader';
import { toUint4Array } from './buffer';

const SIGNATURE = '#$unity3dchina!@';

export class UnityCN {
  private readonly key: Buffer;
  private readonly index: Uint8Array;
  private readonly sub = new Uint8Array(0x10);

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
    this.index = info.subarray(0, 0x10);
    const sub = info.subarray(0x10, 0x20);
    for (let i = 0; i < sub.length; i++) {
      const idx = Math.floor((i % 4) * 4 + i / 4);
      this.sub[idx] = sub[i];
    }
  }

  private decrypt(data: Buffer) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.key, null);
    decipher.update(data);
    return decipher.final();
  }

  private decryptKey(key: Buffer, data: Buffer) {
    key = this.decrypt(key);
    const result = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      result[i] = data[i] ^ key[i];
    }
    return Buffer.from(result);
  }
}
