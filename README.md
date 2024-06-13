# unity-js

[![NPM version](https://img.shields.io/npm/v/@arkntools/unity-js?style=flat-square)](https://www.npmjs.com/package/@arkntools/unity-js)

JS implementation of Unity AssetBundle unpacking.

Only the minimum implementation required for the project was done. If you need complete functionality, it is recommended to use a more complete library in other languages.

Currently only supports:

- TextAsset
- Texture2d
- Sprite
- SpriteAtlas

```js
import fs from 'fs';
import { loadAssetBundle, AssetType } from '@arkntools/unity-js';

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('character_table003334.ab'));
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.TextAsset) {
      fs.writeFileSync(`${obj.name}.bytes`, obj.data);
      break;
    }
  }
})();

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('spritepack_ui_char_avatar_h1_0.ab'));
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.Sprite && obj.name === 'char_002_amiya') {
      fs.writeFileSync(`${obj.name}.png`, await obj.getImage()!);
      break;
    }
  }
})();

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('char_1028_texas2.ab'), {
    // Some sprites may not give the PathID of the alpha texture, you can provide a custom function to find it.
    findAlphaTexture: (texture, assets) =>
      assets.find(({ name }) => name === `${texture.name}[alpha]`),
  });
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.Sprite && obj.name === 'char_1028_texas2_1') {
      fs.writeFileSync(`${obj.name}.png`, await obj.getImage()!);
      break;
    }
  }
})();
```

## References

- [Perfare/AssetStudio](https://github.com/Perfare/AssetStudio)
- [RazTools/Studio](https://github.com/RazTools/Studio)
- [K0lb3/UnityPy](https://github.com/K0lb3/UnityPy)
- [yuanyan3060/unity-rs](https://github.com/yuanyan3060/unity-rs)
