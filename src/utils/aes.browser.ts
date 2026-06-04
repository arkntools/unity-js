import { ModeOfOperation } from 'aes-js';

const AesEcb = ModeOfOperation.ecb;

export const aesEcbEncrypt = (
  data: ArrayBuffer,
  key: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  const cipher = new AesEcb(key);
  return cipher.encrypt(new Uint8Array(data)) as Uint8Array<ArrayBuffer>;
};
