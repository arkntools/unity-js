import { last } from 'es-toolkit';
import type { FileMagicNumber } from '../utils/fileMagicNumber';
import { recognizeFile } from '../utils/fileMagicNumber';
import { ArrayBufferReader } from '../utils/reader';
import { AssetBase } from './base';
import type { ObjectInfo } from './types';
import { AssetType } from './types';

export enum AudioCompressionFormat {
  UnknownType = -1,
  PCM = 0,
  Vorbis = 1,
  ADPCM = 2,
  MP3 = 3,
  PSMVAG = 4,
  HEVAG = 5,
  XMA = 6,
  AAC = 7,
  GCADPCM = 8,
  ATRAC9 = 9,
}

export enum FMODSoundType {
  UNKNOWN = 0,
  ACC = 1,
  AIFF = 2,
  ASF = 3,
  AT3 = 4,
  CDDA = 5,
  DLS = 6,
  FLAC = 7,
  FSB = 8,
  GCADPCM = 9,
  IT = 10,
  MIDI = 11,
  MOD = 12,
  MPEG = 13,
  OGGVORBIS = 14,
  PLAYLIST = 15,
  RAW = 16,
  S3M = 17,
  SF2 = 18,
  USER = 19,
  WAV = 20,
  XM = 21,
  XMA = 22,
  VAG = 23,
  AUDIOQUEUE = 24,
  XWMA = 25,
  BCWAV = 26,
  AT9 = 27,
  VORBIS = 28,
  MEDIA_FOUNDATION = 29,
}

export enum AudioClipMetaType {
  Low,
  High,
}

export type AudioClipMeta =
  | {
      type: AudioClipMetaType.Low;
      format: number;
      soundType: FMODSoundType;
      is3d: boolean;
      useHardware: boolean;
    }
  | {
      type: AudioClipMetaType.High;
      loadType: number;
      channels: number;
      frequency: number;
      bitsPerSample: number;
      length: number;
      isTrackerFormat: boolean;
      subsoundIndex: number;
      preloadAudioData: boolean;
      loadInBackground: boolean;
      legacy3d: boolean;
      compressionFormat: AudioCompressionFormat;
    };

export interface AudioClipGetResult {
  format: string;
  size: number;
  channels: number | undefined;
  data: Uint8Array<ArrayBuffer>;
}

const magicNumbers: FileMagicNumber[] = [
  {
    name: 'ogg',
    numbers: [0x4f, 0x67, 0x67, 0x53],
  },
  {
    name: 'wav',
    numbers: [0x52, 0x49, 0x46, 0x46],
  },
  {
    name: 'm4a',
    numbers: [0x66, 0x74, 0x79, 0x70],
    start: 4,
  },
];

export class AudioClip extends AssetBase {
  readonly type = AssetType.AudioClip;
  readonly meta: AudioClipMeta;
  readonly source?: string;
  readonly offset?: bigint;
  readonly audioSize: bigint;
  readonly data: Uint8Array<ArrayBuffer>;
  readonly format: string;

  constructor(info: ObjectInfo, r: ArrayBufferReader) {
    super(info, r);

    const { version } = this.__info;

    if (version[0] < 5) {
      this.meta = {
        type: AudioClipMetaType.Low,
        format: r.readInt32(),
        soundType: r.readInt32() as FMODSoundType,
        is3d: r.readBoolean(),
        useHardware: r.readBoolean(),
      };
      r.align(4);

      // 3.2.0 to 5
      if (version[0] >= 4 || (version[0] === 3 && version[1] >= 2)) {
        r.readInt32(); // stream
        const size = r.readInt32();
        this.audioSize = BigInt(size);
        const tsize = size % 4 !== 0 ? size + 4 - (size % 4) : size;
        const { bytesSize, bytesStart } = this.__info;
        if (bytesSize + bytesStart - r.position !== tsize) {
          this.offset = BigInt(r.readUInt32());
          this.source = this.__info.asset.path;
        }
      } else {
        this.audioSize = BigInt(r.readInt32());
      }
    } else {
      this.meta = {
        type: AudioClipMetaType.High,
        loadType: r.readInt32(),
        channels: r.readInt32(),
        frequency: r.readInt32(),
        bitsPerSample: r.readInt32(),
        length: r.readFloat32(),
        isTrackerFormat: (() => {
          const isTrackerFormat = r.readBoolean();
          r.align(4);
          return isTrackerFormat;
        })(),
        subsoundIndex: r.readInt32(),
        preloadAudioData: r.readBoolean(),
        loadInBackground: r.readBoolean(),
        legacy3d: (() => {
          const legacy3d = r.readBoolean();
          r.align(4);
          this.source = r.readAlignedString();
          this.offset = r.readInt64();
          this.audioSize = r.readInt64();
          return legacy3d;
        })(),
        compressionFormat: r.readInt32() as AudioCompressionFormat,
      };
    }

    if (this.source && this.offset !== undefined) {
      const path = last(this.source.split('/'));
      if (!path) throw new Error('[AudioClip] invalid source');

      const { nodes, files } = this.bundle;
      const index = nodes.findIndex(node => node.path === path);
      if (index === -1) throw new Error('[AudioClip] cannot find resource');

      const file = files[index];
      const fileReader = new ArrayBufferReader(file);
      fileReader.seek(Number(this.offset));
      this.data = fileReader.readUInt8Slice(Number(this.audioSize));
    } else {
      this.data = r.readUInt8Slice(Number(this.audioSize));
    }

    this.format = recognizeFile(this.data, magicNumbers) || 'fsb';
  }

  get size() {
    return this.__info.bytesSize + Number(this.audioSize);
  }

  getAudio(): AudioClipGetResult {
    return {
      format: this.format,
      size: Number(this.audioSize),
      channels: this.meta.type === AudioClipMetaType.High ? this.meta.channels : undefined,
      data: this.data,
    };
  }
}
