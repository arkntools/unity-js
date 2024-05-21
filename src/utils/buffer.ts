export const toUint4Array = (data: Uint8Array) => {
  const result = new Uint8Array(data.length * 2);

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    result[i * 2] = byte >> 4;
    result[i * 2 + 1] = byte & 0x0f;
  }

  return result;
};
