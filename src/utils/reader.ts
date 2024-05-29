export class ArrayBufferReader {
  private offset = 0;
  private readonly view: DataView;
  private readonly textDecoder = new TextDecoder();

  constructor(
    buffer: ArrayBuffer,
    private littleEndian = false,
  ) {
    this.view = new DataView(buffer);
  }

  get length() {
    return this.view.byteLength;
  }

  get position() {
    return this.offset;
  }

  clone() {
    return new ArrayBufferReader(this.view.buffer, this.littleEndian);
  }

  setLittleEndian(value: boolean) {
    this.littleEndian = value;
  }

  seek(position: number) {
    this.checkPosition(position);
    this.offset = position;
  }

  move(offset: number) {
    this.seek(this.offset + offset);
  }

  align(size: number) {
    const before = this.offset;
    const remain = before % size;
    const after = remain === 0 ? before : before - remain + size;
    if (after > this.length) throw new Error('Align error');
    this.seek(after);
  }

  readBuffer(length: number) {
    const end = this.checkLength(length);
    const buffer = this.view.buffer.slice(this.offset, end);
    this.offset += length;
    return buffer;
  }

  readUInt8Slice(length: number) {
    this.checkLength(length);
    const slice = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return slice;
  }

  readString(length: number) {
    const end = this.checkLength(length);
    const buffer = this.view.buffer.slice(this.offset, end);
    const str = this.bufferToString(buffer);
    this.offset += length;
    return str;
  }

  readStringUntilZero() {
    let length = 0;
    while (this.offset + length < this.length && this.view.getUint8(this.offset + length) !== 0) {
      length++;
    }
    if (!(length <= this.length && this.view.getUint8(this.offset + length) === 0)) {
      throw new Error('Invalid string length');
    }
    const str = this.readString(length);
    this.offset++;
    return str;
  }

  readAlignedString() {
    const length = this.readUInt32();
    const str = this.readString(length);
    this.align(4);
    return str;
  }

  readAlignedStringArray() {
    const strings: string[] = [];
    const length = this.readUInt32();
    for (let i = 0; i < length; i++) {
      strings.push(this.readAlignedString());
    }
    return strings;
  }

  readBoolean() {
    return Boolean(this.readUInt8());
  }

  readInt8() {
    const value = this.view.getInt8(this.offset);
    this.offset++;
    return value;
  }

  readUInt8() {
    const value = this.view.getUint8(this.offset);
    this.offset++;
    return value;
  }

  readRectF32() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      width: this.readFloat32(),
      height: this.readFloat32(),
    };
  }

  readVector2() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
    };
  }

  readVector3() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
    };
  }

  readVector4() {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
      w: this.readFloat32(),
    };
  }

  private checkPosition(position: number) {
    if (position < 0) throw new Error(`Position (${position}) must be no negative`);
    if (position > this.length) {
      throw new Error(`Position ${position} out of range ${this.length}`);
    }
  }

  private checkLength(length: number) {
    if (length < 0) throw new Error(`Length (${length}) must be no negative`);
    const end = this.offset + length;
    if (end > this.length) {
      throw new Error(`End position (${end}) out of boundary (${this.length})`);
    }
    return end;
  }

  private bufferToString(buffer: ArrayBuffer) {
    return this.textDecoder.decode(buffer);
  }

  // @ts-expect-error
  readInt16(): number;
  // @ts-expect-error
  readUInt16(): number;
  // @ts-expect-error
  readInt16LE(): number;
  // @ts-expect-error
  readUInt16LE(): number;
  // @ts-expect-error
  readInt16BE(): number;
  // @ts-expect-error
  readUInt16BE(): number;
  // @ts-expect-error
  readInt32(): number;
  // @ts-expect-error
  readUInt32(): number;
  // @ts-expect-error
  readInt32LE(): number;
  // @ts-expect-error
  readUInt32LE(): number;
  // @ts-expect-error
  readInt32BE(): number;
  // @ts-expect-error
  readUInt32BE(): number;
  // @ts-expect-error
  readInt64(): bigint;
  // @ts-expect-error
  readUInt64(): bigint;
  // @ts-expect-error
  readInt64LE(): bigint;
  // @ts-expect-error
  readUInt64LE(): bigint;
  // @ts-expect-error
  readInt64BE(): bigint;
  // @ts-expect-error
  readUInt64BE(): bigint;
  // @ts-expect-error
  readFloat32(): number;
  // @ts-expect-error
  readFloat32LE(): number;
  // @ts-expect-error
  readFloat32BE(): number;
  // @ts-expect-error
  readFloat64(): number;
  // @ts-expect-error
  readFloat64LE(): number;
  // @ts-expect-error
  readFloat64BE(): number;
}

for (const bits of [16, 32, 64]) {
  const addOffset = Math.round(bits / 8);
  for (const unsigned of ['', 'U']) {
    for (const [littleEndian, suffix] of [
      [null, ''],
      [true, 'LE'],
      [false, 'BE'],
    ]) {
      const fnName = `read${unsigned}Int${bits}${suffix}`;
      const viewFnName = `get${bits === 64 ? 'Big' : ''}${unsigned ? 'Uint' : 'Int'}${bits}`;
      (ArrayBufferReader.prototype as any)[fnName] =
        littleEndian === null
          ? function (this: any) {
              const value = this.view[viewFnName](this.offset, this.littleEndian);
              this.offset += addOffset;
              return value;
            }
          : function (this: any) {
              const value = this.view[viewFnName](this.offset, littleEndian);
              this.offset += addOffset;
              return value;
            };
    }
  }
}

for (const bits of [32, 64]) {
  const addOffset = Math.round(bits / 8);
  for (const [littleEndian, suffix] of [
    [null, ''],
    [true, 'LE'],
    [false, 'BE'],
  ]) {
    const fnName = `readFloat${bits}${suffix}`;
    const viewFnName = `getFloat${bits}`;
    (ArrayBufferReader.prototype as any)[fnName] =
      littleEndian === null
        ? function (this: any) {
            const value = this.view[viewFnName](this.offset, this.littleEndian);
            this.offset += addOffset;
            return value;
          }
        : function (this: any) {
            const value = this.view[viewFnName](this.offset, littleEndian);
            this.offset += addOffset;
            return value;
          };
  }
}
