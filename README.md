# unity-js

[![NPM version](https://img.shields.io/npm/v/@arkntools/unity-js?style=flat-square)](https://www.npmjs.com/package/@arkntools/unity-js)

Unity ab 解包的 js 实现，抄自 [K0lb3/UnityPy](https://github.com/K0lb3/UnityPy) & [yuanyan3060/unity-rs](https://github.com/yuanyan3060/unity-rs)

仅做了项目所需的最低限度实现，如果需要较完整的功能建议还是去用现成的

目前仅支持：

- TextAsset
- Texture2d
- Sprite
- AssetBundle

```js
import fs from 'fs';
import { loadAssetBundle, AssetType } from '@arkntools/unity-js';

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('character_table003334.ab'));
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.TextAsset) {
      const asset = await obj.load();
      fs.writeFileSync(`${asset.name}.bytes`, asset.data);
      break;
    }
  }
})();

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('spritepack_ui_char_avatar_h1_0.ab'));
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.Sprite && obj.name === 'char_002_amiya') {
      const asset = await obj.load();
      fs.writeFileSync(`${asset.name}.png`, asset.data);
      break;
    }
  }
})();

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('char_1028_texas2.ab'), {
    // 有些 Sprite 可能不会给出 AlphaTexture 的 PathID，可以传入自定义函数去寻找
    findAlphaTexture: (texture, assets) =>
      assets.find(({ name }) => name === `${texture.name}[alpha]`),
  });
  for (const obj of bundle.objects) {
    if (obj.type === AssetType.Sprite && obj.name === 'char_1028_texas2_1') {
      const asset = await obj.load();
      fs.writeFileSync(`${asset.name}.png`, asset.data);
      break;
    }
  }
})();
```
