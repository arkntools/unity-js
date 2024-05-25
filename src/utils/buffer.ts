import type BufferReader from 'buffer-reader';

export const toUint4Array = (data: Uint8Array) => {
  const result = new Uint8Array(data.length * 2);

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    result[i * 2] = byte >> 4;
    result[i * 2 + 1] = byte & 0x0f;
  }

  return result;
};

export const alignReader = (r: BufferReader, size: number) => {
  const before = r.tell();
  const remain = before % size;
  const after = remain === 0 ? before : before - remain + size;
  if (after > ((r as any).buf as Buffer).length) throw new Error('Align error');
  r.seek(after);
};

export const createUint8ArraySlice = (target: Uint8Array, start: number) =>
  new Proxy(target, {
    get(t, p, r) {
      const index = Number(p);
      return Reflect.get(t, isNaN(index) ? p : String(start + index), r);
    },
    set(t, p, r) {
      const index = Number(p);
      return Reflect.set(t, isNaN(index) ? p : String(start + index), r);
    },
  });
