import crypto from 'node:crypto';

export const aesEcbEncrypt = (
  data: ArrayBuffer,
  key: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([
    cipher.update(new Uint8Array(data)),
    cipher.final(),
  ]) as Buffer<ArrayBuffer>;
};
