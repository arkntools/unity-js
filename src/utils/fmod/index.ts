import FMOD from '@arkntools/fmod';
import { once } from 'es-toolkit';
import { windowForFMOD } from '#windowForFMOD';

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
  const frequency = sound.$getDefaults(SYMBOL.OUTVAR, SYMBOL.OUTVAR_DISMISS);
  const sampleRate = Math.floor(frequency);
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

  const heap: Uint8Array = FMOD.HEAPU8;
  buffer.set(heap.subarray(ptr1, ptr1 + len1), 44);

  sound.$unlock(ptr1, ptr2, len1, len2);

  return buffer;
};

export const fsbToWav = async ({
  data,
  size,
  channels = 1,
}: {
  data: Uint8Array;
  size: number;
  channels?: number;
}) => {
  const { FMOD, system } = await initFMODSystem(channels);

  const exinfo = FMOD.CREATESOUNDEXINFO();
  exinfo.length = size;

  const sound = createWrapper(system.$createSound(data, FMOD.OPENMEMORY, exinfo, SYMBOL.OUTVAR));
  const subSoundsNum = sound.$getNumSubSounds(SYMBOL.OUTVAR);

  let result: Uint8Array<ArrayBuffer>;

  if (subSoundsNum) {
    const subSound = createWrapper(sound.$getSubSound(0, SYMBOL.OUTVAR));
    result = soundToWav(FMOD, subSound);
    subSound.release();
  } else {
    result = soundToWav(FMOD, sound);
  }

  sound.release();

  return result;
};
