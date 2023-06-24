import BufferReader from 'buffer-reader';

type BufferReaderReadFn = Extract<keyof BufferReader, `${string}BE`> extends `${infer Prefix}BE`
  ? Prefix
  : never;

interface ExtendedMethods {
  clone: () => BufferReaderExtended;
  setEndianness: (e: number) => void;
  align: (size: number) => void;
  nextAlignedString: () => string;
  nextInt64LE: () => number;
  nextInt64BE: () => number;
  nextInt64: () => number;
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
      const length = eR.nextInt32();
      const result = r.nextString(length);
      fns.align(4);
      return result;
    },
    nextInt64LE: () => Number(r.nextBuffer(8).readBigInt64LE()),
    nextInt64BE: () => Number(r.nextBuffer(8).readBigInt64BE()),
    nextInt64: () => (endianness ? fns.nextInt64BE() : fns.nextInt64LE()),
  };
  const eR = new Proxy(r, {
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

  return eR;
};
