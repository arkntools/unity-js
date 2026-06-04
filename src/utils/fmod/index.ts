import FMOD from '@arkntools/fmod';
import { clamp, once } from 'es-toolkit';
import type { LameVbrQuality } from '../lame';
import { encodeMP3 } from '../lame';
import { windowForFMOD } from './window';

const SYMBOL = {
  OUTVAR: Symbol('outvar'),
  OUTVAR_DISMISS: Symbol('outvar_dismiss'),
};

const createWrapper = (Module: any) =>
  new Proxy(Module, {
    get(target, p) {
      if (p in target || typeof p !== 'string' || !p.startsWith('$')) {
        return target[p];
      }
      p = p.substring(1);
      if (typeof target[p] !== 'function') return target[p];
      return (...args: any[]) => {
        const outvars: Array<{ val?: any }> = [];
        const useArgs = args.map(arg => {
          if (arg === SYMBOL.OUTVAR) {
            const outvar = {};
            outvars.push(outvar);
            return outvar;
          }
          if (arg === SYMBOL.OUTVAR_DISMISS) {
            return {};
          }
          return arg;
        });
        const result = target[p](...useArgs);
        if (result !== 0) throw new Error(`[FMOD] ${p} failed, result=${result}`);
        return outvars.length > 1 ? outvars.map(outvar => outvar.val) : outvars[0]?.val;
      };
    },
  });

const initFMOD = once(async () => {
  if (!globalThis.self) (globalThis as any).self = globalThis;
  const Module = await FMOD();
  Module.window = windowForFMOD;
  return createWrapper(Module);
});

const systemCache = new Map<number, any>();

const initFMODSystem = async (channels: number) => {
  const FMOD = await initFMOD();
  let system = systemCache.get(channels);
  if (!system) {
    system = createWrapper(FMOD.$System_Create(SYMBOL.OUTVAR));
    system.$init(channels, FMOD.INIT_NORMAL, 0);
    systemCache.set(channels, system);
  }
  return { FMOD, system };
};

const numberToBits = (num: number, short = false) => {
  const array = new Uint8Array(short ? 2 : 4);
  new DataView(array.buffer)[short ? 'setUint16' : 'setUint32'](0, num, true);
  return array;
};

const soundToWav = (FMOD: any, sound: any) => {
  const [format, channels, bits] = sound.$getFormat(
    SYMBOL.OUTVAR_DISMISS,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
  );
  const sampleRate = Math.floor(sound.$getDefaults(SYMBOL.OUTVAR, SYMBOL.OUTVAR_DISMISS));
  const length = sound.$getLength(SYMBOL.OUTVAR, FMOD.TIMEUNIT_PCMBYTES);
  const [ptr1, ptr2, len1, len2] = sound.$lock(
    0,
    length,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
  );

  let wavFormat: number;
  if (
    [
      FMOD.SOUND_FORMAT_PCM8,
      FMOD.SOUND_FORMAT_PCM16,
      FMOD.SOUND_FORMAT_PCM24,
      FMOD.SOUND_FORMAT_PCM32,
    ].includes(format)
  ) {
    wavFormat = 1;
  } else if (format === FMOD.SOUND_FORMAT_PCMFLOAT) {
    wavFormat = 3;
  } else {
    throw new Error(`[FMOD] unsupported sound format: ${format}`);
  }

  const textEncoder = new TextEncoder();
  const buffer = new Uint8Array(len1 + 44);

  buffer.set(textEncoder.encode('RIFF'), 0);
  buffer.set(numberToBits(len1 + 36), 4);
  buffer.set(textEncoder.encode('WAVEfmt '), 8);
  buffer.set(numberToBits(16), 16);
  buffer.set(numberToBits(wavFormat, true), 20);
  buffer.set(numberToBits(channels, true), 22);
  buffer.set(numberToBits(sampleRate), 24);
  buffer.set(numberToBits((sampleRate * channels * bits) / 8), 28);
  buffer.set(numberToBits((channels * bits) / 8, true), 32);
  buffer.set(numberToBits(bits, true), 34);
  buffer.set(textEncoder.encode('data'), 36);
  buffer.set(numberToBits(len1), 40);

  const heap: Uint8Array<ArrayBufferLike> = FMOD.HEAPU8;
  buffer.set(heap.subarray(ptr1, ptr1 + len1), 44);

  sound.$unlock(ptr1, ptr2, len1, len2);

  return buffer;
};

const splitWavChannels = (wav: Float32Array, stereo: boolean) => {
  if (!stereo) {
    return [wav];
  }

  const singleChannelLength = wav.length / 2;

  const leftChannel = new Float32Array(singleChannelLength);
  const rightChannel = new Float32Array(singleChannelLength);

  for (let i = 0; i < singleChannelLength; i++) {
    const index = i * 2;
    leftChannel[i] = wav[index];
    rightChannel[i] = wav[index + 1];
  }

  return [leftChannel, rightChannel];
};

const soundToMp3 = async (FMOD: any, sound: any, options?: FsbConvertOptions) => {
  const [format, channels] = sound.$getFormat(
    SYMBOL.OUTVAR_DISMISS,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR_DISMISS,
  );

  if (format !== FMOD.SOUND_FORMAT_PCMFLOAT) {
    throw new Error(`[soundToMp3] not supported for format ${format} yet`);
  }

  const sampleRate = Math.floor(sound.$getDefaults(SYMBOL.OUTVAR, SYMBOL.OUTVAR_DISMISS));
  const length = sound.$getLength(SYMBOL.OUTVAR, FMOD.TIMEUNIT_PCMBYTES);
  const [ptr1, ptr2, len1, len2] = sound.$lock(
    0,
    length,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
    SYMBOL.OUTVAR,
  );

  const heap: Uint8Array<ArrayBufferLike> = FMOD.HEAPU8;

  const wavF32Pcm = new Float32Array(heap.slice(ptr1, ptr1 + len1).buffer).map(v =>
    clamp(v, -1, 1),
  );

  const stereo = channels > 1;
  const mp3 = await encodeMP3(splitWavChannels(wavF32Pcm, stereo), {
    sampleRate,
    stereo,
    vbrQuality: options?.vbrQuality ?? 0,
  });

  sound.$unlock(ptr1, ptr2, len1, len2);

  return mp3;
};

export enum FsbConvertFormat {
  WAV = 'wav',
  MP3 = 'mp3',
}

const converters = {
  [FsbConvertFormat.WAV]: soundToWav,
  [FsbConvertFormat.MP3]: soundToMp3,
};

export interface FsbConvertOptions {
  /**
   * Only works for mp3.
   * `0` highest quality,
   * `9` lowest quality.
   * @default 0
   */
  vbrQuality?: LameVbrQuality;
}

export const convertFsb = async (
  {
    data,
    size,
    channels = 1,
  }: {
    data: Uint8Array<ArrayBuffer>;
    size: number;
    channels?: number;
  },
  target: FsbConvertFormat,
  options?: FsbConvertOptions,
) => {
  const { FMOD, system } = await initFMODSystem(channels);

  const exinfo = FMOD.CREATESOUNDEXINFO();
  exinfo.length = size;

  const sound = createWrapper(system.$createSound(data, FMOD.OPENMEMORY, exinfo, SYMBOL.OUTVAR));
  const subSoundsNum = sound.$getNumSubSounds(SYMBOL.OUTVAR);

  let result: Uint8Array<ArrayBuffer>;
  let error: any;

  if (subSoundsNum) {
    const subSound = createWrapper(sound.$getSubSound(0, SYMBOL.OUTVAR));
    try {
      result = await converters[target](FMOD, subSound, options);
    } catch (e) {
      error = e;
    }
    subSound.release();
  } else {
    try {
      result = await converters[target](FMOD, sound, options);
    } catch (e) {
      error = e;
    }
  }

  sound.release();

  if (error) throw error;

  return result!;
};
