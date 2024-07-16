import type { Vector3 } from '../types';
import type { ArrayBufferReader } from '../utils/reader';
import type { GfxPrimitiveType } from './types';

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

// export class VertexData {}
