import JSZip from 'jszip';

const matchHeader = (data: ArrayBuffer, header: Array<number | number[]>) => {
  const view = new Uint8Array(data, 0, header.length);
  return header.every((val, i) => {
    const cur = view[i];
    return typeof val === 'number' ? val === cur : val.some(v => v === cur);
  });
};

export const isZip = (data: ArrayBuffer) =>
  matchHeader(data, [0x50, 0x4b, [0x3, 0x5, 0x7], [0x4, 0x6, 0x8]]);

export const unzip = async (data: ArrayBuffer) => {
  const zip = await JSZip.loadAsync(data);
  return await Object.values(zip.files)[0].async('arraybuffer');
};

export const unzipIfNeed = async (data: ArrayBuffer) => (isZip(data) ? await unzip(data) : data);
