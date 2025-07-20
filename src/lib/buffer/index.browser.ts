import { Buffer } from 'buffer/';

if (!globalThis.Buffer) {
  // @ts-ignore
  globalThis.Buffer = Buffer;
}
