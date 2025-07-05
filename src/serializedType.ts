import type { AssetHeader } from './asset';
import { commonString } from './const';
import { ArrayBufferReader } from './utils/reader';

export interface TypeTreeNode {
  type: string;
  name: string;
  size: number;
  index: number;
  typeFlag: number;
  version: number;
  metaFlag: number;
  level: number;
  typeStrOffset: number;
  nameStrOffset: number;
  refTypeHash: bigint;
}

export interface TypeTree {
  nodes: TypeTreeNode[];
  stringBuffer: ArrayBuffer;
}

const readString = (reader: ArrayBufferReader, offset: number): string => {
  const isOffset = (offset & 0x80000000) === 0;
  if (isOffset) {
    reader.seek(offset);
    const str = reader.readStringUntilZero();
    return str;
  }
  offset = offset & 0x7fffffff;
  return commonString[offset] ?? String(offset);
};

export class SerializedType {
  readonly classId: number;
  readonly isStrippedType: boolean = false;
  readonly scriptTypeIndex?: number;
  readonly typeTree: TypeTree = { nodes: [], stringBuffer: new ArrayBuffer(0) };
  readonly scriptId = new Uint8Array(16);
  readonly oldTypeHash = new Uint8Array(16);
  readonly typeDependencies: number[] = [];
  readonly klassName: string = '';
  readonly nameSpace: string = '';
  readonly asmName: string = '';

  constructor(
    r: ArrayBufferReader,
    header: AssetHeader,
    enableTypeTree: boolean,
    isRefType: boolean,
  ) {
    const { version } = header;

    this.classId = r.readInt32();

    if (version >= 16) {
      this.isStrippedType = r.readBoolean();
    }

    if (version >= 17) {
      this.scriptTypeIndex = r.readInt16();
    }

    if (version >= 13) {
      if (
        (isRefType && this.scriptTypeIndex !== undefined) ||
        (version < 16 && this.classId < 0) ||
        (version >= 16 && this.classId === 114)
      ) {
        this.scriptId = r.readUInt8Slice(16);
      }
      this.oldTypeHash = r.readUInt8Slice(16);
    }

    if (enableTypeTree) {
      if (version >= 12 || version === 10) {
        this.typeTree = this.readTypeTreeBlob(r, header);
      } else {
        throw new Error(`Unsupported asset version: ${version}`);
      }
      if (version >= 21) {
        if (isRefType) {
          this.klassName = r.readStringUntilZero();
          this.nameSpace = r.readStringUntilZero();
          this.asmName = r.readStringUntilZero();
        } else {
          const length = r.readInt32();
          for (let i = 0; i < length; i++) {
            this.typeDependencies.push(r.readInt32());
          }
        }
      }
    }
  }

  private readTypeTreeBlob(r: ArrayBufferReader, { version }: AssetHeader): TypeTree {
    const nodeNumber = r.readInt32();
    const stringBufferSize = r.readInt32();

    const nodes: TypeTreeNode[] = [];

    for (let i = 0; i < nodeNumber; i++) {
      const typeTreeNode: TypeTreeNode = {
        version: r.readUInt16(),
        level: r.readUInt8(),
        typeFlag: r.readUInt8(),
        typeStrOffset: r.readUInt32(),
        nameStrOffset: r.readUInt32(),
        size: r.readInt32(),
        index: r.readInt32(),
        metaFlag: r.readInt32(),
        type: '',
        name: '',
        refTypeHash: 0n,
      };

      if (version >= 19) {
        typeTreeNode.refTypeHash = r.readUInt64();
      }

      nodes.push(typeTreeNode);
    }

    const stringBuffer = r.readBuffer(stringBufferSize);
    const stringBufferReader = new ArrayBufferReader(stringBuffer);

    for (const node of nodes) {
      node.type = readString(stringBufferReader, node.typeStrOffset);
      node.name = readString(stringBufferReader, node.nameStrOffset);
    }

    return {
      nodes,
      stringBuffer,
    };
  }
}
