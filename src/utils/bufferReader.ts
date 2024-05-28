export class BufferReader {
  private offset = 0;
  private readonly view: DataView;
  private readonly textDecoder = new TextDecoder();

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  tell() {
    return this.offset;
  }

  seek(position: number) {
    this.checkPosition(position);
    this.offset = position;
  }

  move(offset: number) {
    this.seek(this.offset + offset);
  }

  nextBuffer(length: number) {
    const end = this.checkLength(length);
    const buffer = this.view.buffer.slice(this.offset, end);
    this.offset += length;
    return buffer;
  }

  nextString(length: number) {
    const end = this.checkLength(length);
    const buffer = this.view.buffer.slice(this.offset, end);
    const str = this.bufferToString(buffer);
    this.offset += length;
    return str;
  }

  nextStringZero() {
    let length = 0;
    while (
      this.offset + length < this.view.byteLength &&
      this.view.getUint8(this.offset + length) !== 0
    ) {
      length++;
    }
    if (!(length <= this.view.byteLength && this.view.getUint8(this.offset + length) === 0)) {
      throw new Error('Invalid string length');
    }
    return this.nextString(length);
  }

  private checkPosition(position: number) {
    if (position < 0) throw new Error(`Position (${position}) must be no negative`);
    if (position >= this.view.byteLength) {
      throw new Error(`Position ${position} out of range ${this.view.byteLength}`);
    }
  }

  private checkLength(length: number) {
    if (length < 0) throw new Error(`Length (${length}) must be no negative`);
    const end = this.offset + length;
    if (end >= this.view.byteLength) {
      throw new Error(`End position (${end}) out of boundary (${this.view.byteLength})`);
    }
    return end;
  }

  private bufferToString(buffer: ArrayBuffer) {
    return this.textDecoder.decode(buffer);
  }
}
