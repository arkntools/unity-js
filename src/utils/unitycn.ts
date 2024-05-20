import crypto from 'crypto';
import type BufferReader from 'buffer-reader';

const SIGNATURE = '#$unity3dchina!@';

export class UnityCN {
  private readonly key: Buffer;

  public constructor(r: BufferReader, keyHex: string) {
    this.key = Buffer.from(keyHex, 'hex');

    r.move(4);

    const infoBytes = r.nextBuffer(16);
    const infoKey = r.nextBuffer(16);
    r.move(1);

    const signatureBytes = r.nextBuffer(16);
    const signatureKey = r.nextBuffer(16);
    r.move(1);

    const signature = this.decryptKey(signatureKey, signatureBytes).toString('utf8');
    if (signature !== SIGNATURE) {
      throw new Error(`Invalid signature, expected "${SIGNATURE}" but got "${signature}"`);
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
