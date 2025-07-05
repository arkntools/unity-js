import type { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { MonoScript } from './monoScript';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export class MonoBehaviour extends AssetBase {
  readonly type = AssetType.MonoBehaviour;
  readonly gameObject: PPtr;
  readonly enable: boolean;
  readonly script: PPtr<MonoScript>;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r, false);
    this.gameObject = new PPtr(info, r);
    this.enable = r.readBoolean();
    r.align(4);
    this.script = new PPtr<MonoScript>(info, r);
    this.readName(r);
  }
}
