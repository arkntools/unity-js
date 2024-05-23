import Jimp from 'jimp';

export const getJimpPNG = (img: Jimp) => img.deflateStrategy(0).getBufferAsync(Jimp.MIME_PNG);
