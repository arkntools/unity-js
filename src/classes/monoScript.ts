import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export class MonoScript extends AssetBase {
  readonly type = AssetType.MonoScript;
  readonly className: string;
  readonly namespace?: string;
  readonly assemblyName: string;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const { version } = this.__info;
    if (version[0] > 3 || (version[0] === 3 && version[1] >= 4)) {
      r.move(4);
    }
    if (version[0] < 5) {
      r.move(4);
    } else {
      r.move(16);
    }
    if (version[0] < 3) {
      r.readAlignedString();
    }
    this.className = r.readAlignedString();
    if (version[0] >= 3) this.namespace = r.readAlignedString();
    this.assemblyName = r.readAlignedString();
  }
}
