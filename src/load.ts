import { BundleEnv } from './assetFile';
import type { AssetFile, AssetFileLoadOptions } from './assetFile';
import { BundleFile } from './bundle';
import { ensureArrayBuffer } from './utils/buffer';
import { ArrayBufferReader } from './utils/reader';
import { isValidVFSHeader } from './utils/vfs';
import { unzipIfNeed } from './utils/zip';
import { VFSFile } from './vfs';

export async function load(
  data: ArrayBuffer | Uint8Array<ArrayBuffer> | Buffer<ArrayBuffer>,
  options?: AssetFileLoadOptions,
): Promise<AssetFile> {
  const buf = ensureArrayBuffer(data);

  if (options?.env === BundleEnv.ARKNIGHTS_ENDFIELD && isValidVFSHeader(buf)) {
    const r = new ArrayBufferReader(buf);
    r.setLittleEndian(false); // big-endian
    return new VFSFile(r, options);
  }

  const r = new ArrayBufferReader(await unzipIfNeed(buf));
  return new BundleFile(r, options);
}
