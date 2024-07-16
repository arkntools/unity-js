import { maxBy } from 'es-toolkit';
import type { Vector3 } from '../types';
import { ArrayBufferReader } from '../utils/reader';
import {
  VertexChannelFormat,
  VertexFormat,
  VertexFormat2017,
  type GfxPrimitiveType,
} from './types';

export class SubMesh {
  readonly firstByte: number;
  readonly indexCount: number;
  readonly topology: GfxPrimitiveType;
  readonly triangleCount?: number;
  readonly baseVertex?: number;
  readonly firstVertex?: number;
  readonly vertexCount?: number;
  readonly localAABB?: AABB;

  constructor(r: ArrayBufferReader, version: number[]) {
    this.firstByte = r.readUInt32();
    this.indexCount = r.readUInt32();
    this.topology = r.readUInt32();
    if (version[0] < 4) {
      this.triangleCount = r.readUInt32();
    }
    if (version[0] > 2017 || (version[0] === 2017 && version[1] >= 3)) {
      this.baseVertex = r.readUInt32();
    }
    if (version[0] >= 3) {
      this.firstVertex = r.readUInt32();
      this.vertexCount = r.readUInt32();
      this.localAABB = new AABB(r);
    }
  }
}

export class AABB {
  readonly center: Vector3;
  readonly extent: Vector3;

  constructor(r: ArrayBufferReader) {
    this.center = r.readVector3();
    this.extent = r.readVector3();
  }
}

export class VertexData {
  readonly currentChannels?: number;
  readonly vertexCount: number;
  readonly channels?: ChannelInfo[];
  readonly streams?: StreamInfo[];
  readonly dataSize: Uint8Array;

  constructor(r: ArrayBufferReader, version: number[]) {
    if (version[0] < 2018) {
      this.currentChannels = r.readUInt32();
    }
    this.vertexCount = r.readUInt32();
    if (version[0] >= 4) {
      const channelsSize = r.readInt32();
      this.channels = [];
      for (let i = 0; i < channelsSize; i++) {
        this.channels.push(new ChannelInfo(r));
      }
    }
    if (version[0] < 5) {
      throw new Error('VertexData version[0] < 5 not implemented.');
    } else {
      const channels = this.channels!;
      const streamCount = maxBy(channels, ({ stream }) => stream).stream + 1;
      this.streams = [];
      for (let s = 0, offset = 0; s < streamCount; s++) {
        let channelMask = 0;
        let stride = 0;
        channels.forEach((channel, chn) => {
          if (channel.stream === s && channel.dimension > 0) {
            channelMask |= 1 << chn;
            stride +=
              channel.dimension * getVertexFormatSize(toVertexFormat(channel.format, version));
          }
        });
        this.streams.push(
          new StreamInfo({
            channelMask,
            offset,
            stride,
            dividerOp: 0,
            frequency: 0,
          }),
        );
        offset += this.vertexCount * stride;
        // align size with 16
        offset = (offset + 15) & ~15;
      }
    }
    this.dataSize = new Uint8Array(r.readBuffer(r.readInt32()));
  }
}

export class ChannelInfo {
  readonly stream: number;
  readonly offset: number;
  readonly format: number;
  readonly dimension: number;

  constructor(r: ArrayBufferReader) {
    this.stream = r.readUInt8();
    this.offset = r.readUInt8();
    this.format = r.readUInt8();
    this.dimension = r.readUInt8() & 0xf;
  }
}

export class StreamInfo {
  readonly channelMask!: number;
  readonly offset!: number;
  readonly stride!: number;
  readonly align?: number;
  readonly dividerOp?: number;
  readonly frequency?: number;

  constructor(init: StreamInfo);
  constructor(r: ArrayBufferReader, version: number[]);
  constructor(r: ArrayBufferReader | StreamInfo, version?: number[]) {
    if (r instanceof ArrayBufferReader) {
      this.channelMask = r.readUInt32();
      this.offset = r.readUInt32();
      if (version![0] < 4) {
        this.stride = r.readUInt32();
        this.align = r.readUInt32();
      } else {
        this.stride = r.readUInt8();
        this.dividerOp = r.readUInt8();
        this.frequency = r.readUInt16();
      }
    } else {
      Object.assign(this, r);
    }
  }
}

export const toVertexFormat = (format: number, version: number[]) => {
  if (version[0] < 2017) {
    switch (format) {
      case VertexChannelFormat.Float:
        return VertexFormat.Float;
      case VertexChannelFormat.Float16:
        return VertexFormat.Float16;
      case VertexChannelFormat.Color:
        return VertexFormat.UNorm8;
      case VertexChannelFormat.Byte:
        return VertexFormat.UInt8;
      case VertexChannelFormat.UInt32:
        return VertexFormat.UInt32;
      default:
        throw new Error(`Unknown VertexChannelFormat ${format}`);
    }
  }
  if (version[0] < 2019) {
    switch (format) {
      case VertexFormat2017.Float:
        return VertexFormat.Float;
      case VertexFormat2017.Float16:
        return VertexFormat.Float16;
      case VertexFormat2017.Color:
      case VertexFormat2017.UNorm8:
        return VertexFormat.UNorm8;
      case VertexFormat2017.SNorm8:
        return VertexFormat.SNorm8;
      case VertexFormat2017.UNorm16:
        return VertexFormat.UNorm16;
      case VertexFormat2017.SNorm16:
        return VertexFormat.SNorm16;
      case VertexFormat2017.UInt8:
        return VertexFormat.UInt8;
      case VertexFormat2017.SInt8:
        return VertexFormat.SInt8;
      case VertexFormat2017.UInt16:
        return VertexFormat.UInt16;
      case VertexFormat2017.SInt16:
        return VertexFormat.SInt16;
      case VertexFormat2017.UInt32:
        return VertexFormat.UInt32;
      case VertexFormat2017.SInt32:
        return VertexFormat.SInt32;
      default:
        throw new Error(`Unknown VertexFormat2017 ${format}`);
    }
  }
  return format as VertexFormat;
};

export const getVertexFormatSize = (format: VertexFormat) => {
  switch (format) {
    case VertexFormat.Float:
    case VertexFormat.UInt32:
    case VertexFormat.SInt32:
      return 4;
    case VertexFormat.Float16:
    case VertexFormat.UNorm16:
    case VertexFormat.SNorm16:
    case VertexFormat.UInt16:
    case VertexFormat.SInt16:
      return 2;
    case VertexFormat.UNorm8:
    case VertexFormat.SNorm8:
    case VertexFormat.UInt8:
    case VertexFormat.SInt8:
      return 1;
    default:
      throw new Error(`Unknown VertexFormat ${format as number}`);
  }
};
