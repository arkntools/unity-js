# unity-js

[![NPM version](https://img.shields.io/npm/v/@arkntools/unity-js?style=flat-square)](https://www.npmjs.com/package/@arkntools/unity-js)

JS implementation of Unity AssetBundle unpacking.

Only the minimum implementation required for the project was done. If you need complete functionality, it is recommended to use a more complete library in other languages.

Currently supports:

- TextAsset
- Texture2d
- Sprite
- SpriteAtlas
- MonoBehaviour
- MonoScript
- AudioClip
- Material

## Usage Examples

### Normal

```js
import fs from 'fs';
import { loadAssetBundle, AssetType, BundleEnv } from '@arkntools/unity-js';

// TextAsset
const bundle = await loadAssetBundle(
  fs.readFileSync('character_table003334.ab',
  { env: BundleEnv.ARKNIGHTS }),
);
for (const obj of bundle.objects) {
  if (obj.type === AssetType.TextAsset) {
    fs.writeFileSync(`${obj.name}.bytes`, obj.data);
    break;
  }
}

// Sprite
const bundle = await loadAssetBundle(
  fs.readFileSync('spritepack_ui_char_avatar_h1_0.ab',
  { env: BundleEnv.ARKNIGHTS }),
);
for (const obj of bundle.objects) {
  if (obj.type === AssetType.Sprite && obj.name === 'char_002_amiya') {
    fs.writeFileSync(`${obj.name}.png`, await obj.getImage()!);
    break;
  }
}

// Sprite with custom alpha texture
const bundle = await loadAssetBundle(
  fs.readFileSync('char_1028_texas2.ab', { env: BundleEnv.ARKNIGHTS }),
  {
    // Some sprites may not give the PathID of the alpha texture
    // You can provide a custom function to find it
    findAlphaTexture: (texture, assets) =>
      assets.find(({ name }) => name === `${texture.name}[alpha]`),
  },
);
for (const obj of bundle.objects) {
  if (obj.type === AssetType.Sprite && obj.name === 'char_1028_texas2_1') {
    fs.writeFileSync(`${obj.name}.png`, await obj.getImage()!);
    break;
  }
}
```

### Audio

> [!WARNING]
> If `convertFsb()` is executed in a Node environment, the process can't exit for unknown reasons (possibly due to internal implementation issues with `FMOD` causing `node-web-audio-api` to not be properly released). Please manually call `process.exit()`.

> [!NOTE]
> `convertFsb()` require [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), so it can't be called inside worker.

```js
import fs from 'fs';
import { loadAssetBundle, AssetType, BundleEnv } from '@arkntools/unity-js';
import { convertFsb, FsbConvertFormat } from '@arkntools/unity-js/audio';

const bundle = await loadAssetBundle(
  fs.readFileSync('audio_sound_beta_2_voice_char_002_amiya.dat'),
  { env: BundleEnv.ARKNIGHTS },
);

for (const obj of bundle.objects) {
  if (obj.type === AssetType.AudioClip) {
    const audio = await obj.getAudio();
    if (audio.format === 'fsb') {
      // Support conversion to mp3 or wav
      fs.writeFileSync(`${obj.name}.mp3`, await convertFsb(audio, FsbConvertFormat.MP3));
      fs.writeFileSync(`${obj.name}.wav`, await convertFsb(audio, FsbConvertFormat.WAV));
    } else {
      fs.writeFileSync(`${obj.name}.${audio.format}`, audio.data);
    }
  }
}
```

### Spine

```js
import fs from 'fs';
import { loadAssetBundle, AssetType, BundleEnv } from '@arkntools/unity-js';

const bundle = await loadAssetBundle(
  fs.readFileSync('chararts_char_4195_radian.dat'),
  { env: BundleEnv.ARKNIGHTS },
);

for (const obj of bundle.objects) {
  if (obj.type === AssetType.MonoBehaviour && obj.isSpine) {
    const data = await obj.getSpine();
    if (!data) continue;
    const dir = crypto.randomUUID();
    fs.mkdirSync(dir);
    const { skel, atlas, image } = data;
    Object.entries({ ...skel, ...atlas, ...image }).forEach(([name, buffer]) => {
      fs.writeFileSync(`${dir}/${name}`, Buffer.from(buffer));
    });
  }
}
```

## Use in web environment

This package supports use in a web environment, but you need to polyfill `Buffer`, and Vite needs to exclude the `@jimp/wasm-png` module from optimization.

Example `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer'],
      globals: {
        Buffer: true,
      },
    }),
    // ...
  ],
  optimizeDeps: {
    exclude: ['@jimp/wasm-png'],
  },
  // ...
});
```

## References

- [Escartem/AnimeStudio](https://github.com/Escartem/AnimeStudio)
- [Perfare/AssetStudio](https://github.com/Perfare/AssetStudio)
- [RazTools/Studio](https://github.com/RazTools/Studio)
- [K0lb3/UnityPy](https://github.com/K0lb3/UnityPy)
- [yuanyan3060/unity-rs](https://github.com/yuanyan3060/unity-rs)
- [MooncellWiki/UnityPy](https://github.com/MooncellWiki/UnityPy)
- [MooncellWiki/torappu](https://github.com/MooncellWiki/torappu)
