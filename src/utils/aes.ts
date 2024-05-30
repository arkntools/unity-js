import crypto from 'crypto';

export const aesEcbEncrypt = (data: ArrayBuffer, key: Uint8Array): Uint8Array => {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(new Uint8Array(data)), cipher.final()]);
};
