export interface FileMagicNumber {
  name: string;
  numbers: number[];
  start?: number;
}

export const recognizeFile = (data: Uint8Array<ArrayBuffer>, magicNumbers: FileMagicNumber[]) => {
  for (const { name, numbers, start = 0 } of magicNumbers) {
    if (numbers.every((v, i) => data[start + i] === v)) {
      return name;
    }
  }
};
