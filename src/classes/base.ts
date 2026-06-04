import type { JimpClass } from '@jimp/types';
import { once } from 'es-toolkit';
import { getJimpPNG } from '../lib/jimp';
import type { TypeTreeNode } from '../serializedType';
import { loopEach } from '../utils/loop';
import type { ArrayBufferReader } from '../utils/reader';
import type { ImgBitMap, ObjectInfo } from './types';
import { AssetType } from './types';

export interface GetImage {
  getImage: () => Promise<Buffer<ArrayBuffer>> | undefined;
  getImageJimp: () => JimpClass | undefined;
  getImageBitmap: () => ImgBitMap | undefined;
}

export function defaultGetImage(this: GetImage) {
  const img = this.getImageJimp();
  if (img) return getJimpPNG(img);
}

export function defaultGetImageBitmap(this: GetImage) {
  const bitmap = this.getImageJimp()?.bitmap;
  if (!bitmap) return;
  return {
    data: bitmap.data.buffer as unknown as ArrayBuffer,
    width: bitmap.width,
    height: bitmap.height,
  };
}

const dumpObject = (obj: any): any => {
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) return obj.map(item => dumpObject(item));
    if (obj instanceof Map) {
      return Object.fromEntries(Array.from(obj.entries()).map(([k, v]) => [k, dumpObject(v)]));
    }
    if (obj instanceof Set) {
      return Array.from(obj.values()).map(item => dumpObject(item));
    }

    const result: any = {};

    const className: string | undefined = obj.__class;
    if (className) result.__class = className;

    for (const key in obj) {
      const cur = obj[key];
      if (
        key.startsWith('__') ||
        typeof cur === 'function' ||
        cur instanceof ArrayBuffer ||
        cur instanceof Uint8Array ||
        (typeof cur === 'object' && cur.__doNotDump)
      ) {
        continue;
      }
      result[key] = typeof cur?.dump === 'function' ? cur.dump() : dumpObject(cur);
    }

    return result;
  }

  return obj;
};

const getNodes = (nodes: TypeTreeNode[], index: number): TypeTreeNode[] => {
  const result = [nodes[index]];
  const level = nodes[index].level;

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.level <= level) {
      return result;
    }
    result.push(node);
  }

  return result;
};

export abstract class AssetBase {
  readonly name: string = '';
  abstract readonly type: AssetType;

  constructor(
    protected readonly __info: ObjectInfo,
    r: ArrayBufferReader,
    readName = true,
  ) {
    this.getTypeTree = once(this.getTypeTree.bind(this));
    if (readName) this.readName(r);
  }

  get pathId() {
    return this.__info.pathId;
  }

  get size() {
    return this.__info.bytesSize;
  }

  get container() {
    return this.__info.bundle.getContainer(this.pathId);
  }

  protected get __class() {
    return AssetType[this.type] || 'unknown';
  }

  protected get bundle() {
    return this.__info.bundle;
  }

  dump(): Record<string, any> {
    try {
      return dumpObject(this);
    } catch (error) {
      console.error(`Dump ${this.__class} error:`, error);
      return {};
    }
  }

  getRaw() {
    return this.__info.getReader().readBuffer(this.size);
  }

  getTypeTree(): Record<string, any> {
    const nodes = this.__info.serializedType?.typeTree.nodes;
    if (!nodes) {
      return {};
    }

    const r = this.__info.getReader();
    const result: Record<string, any> = {};

    for (let ctx = { index: 0 }; ctx.index < nodes.length; ctx.index++) {
      const node = nodes[ctx.index];
      const value = this.getTypeTreeValue(nodes, r, ctx);
      result[node.name] = value;
    }

    return result.Base ?? result;
  }

  protected readName(r: ArrayBufferReader) {
    // @ts-expect-error
    this.name = r.readAlignedString();
  }

  private getTypeTreeValue(nodes: TypeTreeNode[], r: ArrayBufferReader, ctx: { index: number }) {
    const node = nodes[ctx.index];
    let align = (node.metaFlag & 0x4000) !== 0;

    let value: any;

    switch (node.type) {
      case 'SInt8':
        value = r.readInt8();
        break;
      case 'UInt8':
      case 'char':
        value = r.readUInt8();
        break;
      case 'short':
      case 'SInt16':
        value = r.readInt16();
        break;
      case 'UInt16':
      case 'unsigned short':
        value = r.readUInt16();
        break;
      case 'int':
      case 'SInt32':
        value = r.readInt32();
        break;
      case 'UInt32':
      case 'unsigned int':
      case 'Type*':
        value = r.readUInt32();
        break;
      case 'long long':
      case 'SInt64':
        value = r.readInt64();
        break;
      case 'UInt64':
      case 'unsigned long long':
      case 'FileSize':
        value = r.readUInt64();
        break;
      case 'float':
        value = r.readFloat32();
        break;
      case 'double':
        value = r.readFloat64();
        break;
      case 'bool':
        value = r.readBoolean();
        break;
      case 'string': {
        value = r.readAlignedString();
        const toSkip = getNodes(nodes, ctx.index);
        ctx.index += toSkip.length - 1;
        break;
      }
      case 'map': {
        if ((nodes[ctx.index + 1].metaFlag & 0x4000) !== 0) {
          align = true;
        }
        const size = r.readInt32();
        const map = getNodes(nodes, ctx.index);
        ctx.index += map.length - 1;
        const first = getNodes(map, 4);
        const second = getNodes(map, 4 + first.length);
        const mapValue: Record<string, any> = {};
        loopEach(size, () => {
          const key = this.getTypeTreeValue(first, r, { index: 0 });
          const val = this.getTypeTreeValue(second, r, { index: 0 });
          mapValue[key] = val;
        });
        value = mapValue;
        break;
      }
      case 'TypelessData': {
        const size = r.readInt32();
        const data = r.readUInt8Slice(size);
        ctx.index += 2;
        value = Array.from(data);
        break;
      }
      default:
        if (ctx.index < nodes.length - 1 && nodes[ctx.index + 1].type === 'Array') {
          if ((nodes[ctx.index + 1].metaFlag & 0x4000) !== 0) {
            align = true;
          }
          const size = r.readInt32();
          const vector = getNodes(nodes, ctx.index);
          ctx.index += vector.length - 1;
          const arrayValue: any[] = [];
          loopEach(size, () => {
            arrayValue.push(this.getTypeTreeValue(vector, r, { index: 3 }));
          });
          value = arrayValue;
        } else {
          const clz = getNodes(nodes, ctx.index);
          ctx.index += clz.length - 1;
          const classValue: Record<string, any> = {};
          for (let ctx2 = { index: 1 }; ctx2.index < clz.length; ctx2.index++) {
            const classNode = clz[ctx2.index];
            const val = this.getTypeTreeValue(clz, r, ctx2);
            classValue[classNode.name] = val;
          }
          value = classValue;
        }
        break;
    }

    if (align) {
      r.align(4);
    }

    return value;
  }
}
