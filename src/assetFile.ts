import type { AssetObject } from './classes';
import type { Texture2D } from './classes/texture2d';
import type { Jimp } from './lib/jimp';
import { ArrayBufferReader } from './utils/reader';

export interface AssetFileLoadOptions {
  /** 有些 Sprite 可能不会给出 AlphaTexture 的 PathID，可以传入自定义函数去寻找 */
  findAlphaTexture?: (texture: Texture2D, assets: Texture2D[]) => Texture2D | undefined;
  unityCNKey?: string;
  env?: BundleEnv;
}

export interface AssetFileNode {
  offset: number;
  size: number;
  flags: number;
  path: string;
}

export interface AssetFile {
  readonly nodes: AssetFileNode[];
  readonly files: ArrayBuffer[];
  readonly objectMap: Map<bigint, AssetObject>;
  readonly objects: AssetObject[];
  readonly textureMixCache: Map<string, Jimp>;
  readonly containerMap?: Map<bigint, String>;
  readonly options?: AssetFileLoadOptions;
  getContainer: (pathId: bigint) => string;
}

export enum FileType {
  ASSETS_FILE,
  BUNDLE_FILE,
  WEB_FILE,
  RESOURCE_FILE,
  GZIP_FILE,
  BROTLI_FILE,
  ZIP_FILE,
}

export enum BundleEnv {
  NONE,
  ARKNIGHTS,
  ARKNIGHTS_ENDFIELD,
}

export enum Signature {
  UNITY_WEB = 'UnityWeb',
  UNITY_RAW = 'UnityRaw',
  UNITY_FS = 'UnityFS',
  UNITY_ARCHIVE = 'UnityArchive',
  UNITY_WEB_DATA_1_0 = '"UnityWebData1.0"',
}

export const getFileType = (data: ArrayBuffer) => {
  const r = new ArrayBufferReader(data);
  const signature = r.readStringUntilZero();

  switch (signature) {
    case Signature.UNITY_WEB:
    case Signature.UNITY_RAW:
    case Signature.UNITY_ARCHIVE:
    case Signature.UNITY_FS:
      return FileType.BUNDLE_FILE;

    case Signature.UNITY_WEB_DATA_1_0:
      return FileType.WEB_FILE;

    default: {
      const GZIP_HEAD = [0x1f, 0x8b];
      const BROTLI_HEAD = [0x62, 0x72, 0x6f, 0x74, 0x6c, 0x69];
      const ZIP_HEAD = [0x50, 0x4b, 0x03, 0x04];
      const ZIP_SPANNED_HEAD = [0x50, 0x4b, 0x07, 0x08];

      const matchHead = (magic: number[], start = 0) => {
        if (r.length < start + magic.length) return false;
        r.seek(start);
        const view = r.readUInt8Slice(magic.length);
        return magic.every((v, i) => view[i] === v);
      };

      const isSerializedFile = () => {
        if (data.byteLength < 20) return false;
        r.seek(0);
        r.move(4);
        let fileSize = r.readUInt32BE();
        const version = r.readUInt32BE();
        let dataOffset = r.readUInt32BE();
        r.move(4);
        if (version >= 22) {
          if (data.byteLength < 48) return false;
          r.move(4);
          fileSize = Number(r.readUInt64BE());
          dataOffset = Number(r.readUInt64BE());
        }
        if (data.byteLength !== fileSize) return false;
        if (dataOffset > fileSize) return false;
        return true;
      };

      // 应该要先复位，猜的
      if (matchHead(GZIP_HEAD)) return FileType.GZIP_FILE;
      if (matchHead(BROTLI_HEAD, 32)) return FileType.BROTLI_FILE;
      if (isSerializedFile()) return FileType.ASSETS_FILE;
      if (matchHead(ZIP_HEAD) || matchHead(ZIP_SPANNED_HEAD)) return FileType.ZIP_FILE;
      return FileType.RESOURCE_FILE;
    }
  }
};
