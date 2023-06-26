import JSZip from 'jszip';

const matchHeader = (data: Buffer, header: Array<number | number[]>) =>
  header.every((val, i) => {
    const cur = data.at(i);
    return typeof val === 'number' ? val === cur : val.some(v => v === cur);
  });

export const isZip = (data: Buffer) =>
  matchHeader(data, [0x50, 0x4b, [0x3, 0x5, 0x7], [0x4, 0x6, 0x8]]);

export const unzip = async (data: Buffer) => {
  const zip = await JSZip.loadAsync(data);
  return await Object.values(zip.files)[0].async('nodebuffer');
};

export const unzipIfNeed = async (data: Buffer) => (isZip(data) ? await unzip(data) : data);
