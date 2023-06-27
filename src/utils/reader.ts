import BufferReader from 'buffer-reader';
import type { RectF32, Vector2, Vector3, Vector4 } from '../types';

type BufferReaderReadFn = Extract<keyof BufferReader, `${string}BE`> extends `${infer Prefix}BE`
  ? Prefix
  : never;

interface ExtendedMethods {
  clone: () => BufferReaderExtended;
  setEndianness: (e: number) => void;
  align: (size: number) => void;
  nextAlignedString: () => string;
  nextInt64LE: () => bigint;
  nextInt64BE: () => bigint;
  nextInt64: () => bigint;
  nextInt64Number: () => number;
  nextInt64String: () => string;
  nextUInt64LE: () => bigint;
  nextUInt64BE: () => bigint;
  nextUInt64: () => bigint;
  nextUInt64Number: () => number;
  nextUInt64String: () => string;
  nextRectF32: () => RectF32;
  nextVector2: () => Vector2;
  nextVector3: () => Vector3;
  nextVector4: () => Vector4;
}

export type BufferReaderExtended = BufferReader & {
  [key in BufferReaderReadFn]: () => number;
} & ExtendedMethods;

const bufferReaderReadFn = new Set(
  Object.keys(BufferReader.prototype)
    .filter(s => s.endsWith('BE'))
    .map(s => s.replace(/BE$/, '')),
);

const isBufferReaderReadFn = (p: any): p is BufferReaderReadFn => bufferReaderReadFn.has(p);

export const createExtendedBufferReader = (data: Buffer): BufferReaderExtended => {
  const r = new BufferReader(data);
  let endianness = 0;
  const fns: ExtendedMethods = {
    setEndianness: (e: number) => {
      endianness = e;
    },
    clone: () => {
      const r = createExtendedBufferReader(data);
      r.setEndianness(endianness);
      return r;
    },
    align: (size: number) => {
      const before = r.tell();
      const remain = before % size;
      const after = remain === 0 ? before : before - remain + size;
      if (after > data.length) throw new Error('Align error');
      r.seek(after);
    },
    nextAlignedString: () => {
      const length = re.nextInt32();
      const result = r.nextString(length);
      fns.align(4);
      return result;
    },
    nextInt64LE: () => r.nextBuffer(8).readBigInt64LE(),
    nextInt64BE: () => r.nextBuffer(8).readBigInt64BE(),
    nextInt64: () => (endianness ? fns.nextInt64BE() : fns.nextInt64LE()),
    nextInt64Number: () => Number(fns.nextInt64()),
    nextInt64String: () => String(fns.nextInt64()),
    nextUInt64LE: () => r.nextBuffer(8).readBigUint64LE(),
    nextUInt64BE: () => r.nextBuffer(8).readBigUint64BE(),
    nextUInt64: () => (endianness ? fns.nextUInt64BE() : fns.nextUInt64LE()),
    nextUInt64Number: () => Number(fns.nextUInt64()),
    nextUInt64String: () => String(fns.nextUInt64()),
    nextRectF32: () => ({
      x: re.nextFloat(),
      y: re.nextFloat(),
      width: re.nextFloat(),
      height: re.nextFloat(),
    }),
    nextVector2: () => ({
      x: re.nextFloat(),
      y: re.nextFloat(),
    }),
    nextVector3: () => ({
      x: re.nextFloat(),
      y: re.nextFloat(),
      z: re.nextFloat(),
    }),
    nextVector4: () => ({
      x: re.nextFloat(),
      y: re.nextFloat(),
      z: re.nextFloat(),
      w: re.nextFloat(),
    }),
  };
  const re = new Proxy(r, {
    get(target, p, receiver) {
      if (isBufferReaderReadFn(p)) {
        return Reflect.get(target, `${p}${endianness ? 'BE' : 'LE'}`, receiver);
      }
      if (p in fns) {
        return fns[p as keyof typeof fns];
      }
      return Reflect.get(target, p, receiver);
    },
  }) as any as BufferReaderExtended;

  return re;
};
