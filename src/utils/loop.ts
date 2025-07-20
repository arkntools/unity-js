export const loopEach = (times: number, callback: (index: number) => any) => {
  for (let i = 0; i < times; i++) {
    callback(i);
  }
};

export const loopMap = <T>(times: number, callback: (index: number) => T) => {
  const result: T[] = [];
  for (let i = 0; i < times; i++) {
    result.push(callback(i));
  }
  return result;
};
