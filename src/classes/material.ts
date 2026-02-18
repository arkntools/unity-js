import type { Texture2D } from '..';
import type { Color, Vector2 } from '../types';
import { loopEach, loopMap } from '../utils/loop';
import type { ArrayBufferReader } from '../utils/reader';
import type { GetImage } from './base';
import { AssetBase, defaultGetImage, defaultGetImageBitmap } from './base';
import { PPtr } from './pptr';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export class Material extends AssetBase implements GetImage {
  readonly type = AssetType.Material;
  shader: PPtr;
  savedProperties: UnityPropertySheet;

  getImage = defaultGetImage;
  getImageBitmap = defaultGetImageBitmap;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);
    const { version } = this.__info;

    this.shader = new PPtr(info, r);

    if (version[0] === 4 && version[1] >= 1) {
      r.readAlignedStringArray();
    }

    if (version[0] > 2021 || (version[0] === 2021 && version[1] >= 3)) {
      r.readAlignedStringArray();
      r.readAlignedStringArray();
    } else if (version[0] >= 5) {
      r.readAlignedString();
    }

    if (version[0] >= 5) {
      r.readUInt32();
    }

    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      r.readBoolean();
      r.align(4);
    }

    if (version[0] > 4 || (version[0] === 4 && version[1] >= 3)) {
      r.readInt32();
    }

    if (version[0] > 5 || (version[0] === 5 && version[1] >= 1)) {
      const stringTagMapSize = r.readInt32();
      loopEach(stringTagMapSize, () => {
        r.readAlignedString();
        r.readAlignedString();
      });
    }

    if (version[0] > 5 || (version[0] === 5 && version[1] >= 6)) {
      r.readAlignedStringArray();
    }

    this.savedProperties = new UnityPropertySheet(info, r);
  }

  getImageJimp() {
    const { texEnvs } = this.savedProperties;
    const mainTex = texEnvs.get('_MainTex')?.texture.object;
    if (!mainTex) return;
    const alphaTex = texEnvs.get('_AlphaTex')?.texture.object;
    if (alphaTex) return mainTex.getMixJimp(alphaTex);
    return mainTex.getImageJimp().premultipliedAlpha();
  }

  getImageName() {
    return this.savedProperties.texEnvs.get('_MainTex')?.texture.object?.name;
  }
}

export class UnityPropertySheet {
  texEnvs: Map<string, UnityTexEnv>;
  ints: Map<string, number>;
  floats: Map<string, number>;
  colors: Map<string, Color>;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    const { version } = info;

    this.texEnvs = new Map(
      loopMap(r.readInt32(), () => [r.readAlignedString(), new UnityTexEnv(info, r)]),
    );

    this.ints = new Map(
      version[0] >= 2021
        ? loopMap(r.readInt32(), () => [r.readAlignedString(), r.readInt32()])
        : [],
    );

    this.floats = new Map(loopMap(r.readInt32(), () => [r.readAlignedString(), r.readFloat32()]));

    this.colors = new Map(loopMap(r.readInt32(), () => [r.readAlignedString(), r.readColor()]));

    // eslint-disable-next-line no-new
    if (info.isArknightsEndfield()) new PPtr(info, r);
  }
}

export class UnityTexEnv {
  texture: PPtr<Texture2D>;
  scale: Vector2;
  offset: Vector2;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    this.texture = new PPtr(info, r);
    this.scale = r.readVector2();
    this.offset = r.readVector2();

    if (info.isArknightsEndfield()) r.move(4);
  }
}
