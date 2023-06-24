# unity-js

[![NPM version](https://img.shields.io/npm/v/@arkntools/unity-js?style=flat-square)](https://www.npmjs.com/package/@arkntools/unity-js)

Unity ab 解包的 js 实现，抄自 [yuanyan3060/unity-rs](https://github.com/yuanyan3060/unity-rs)

仅做了项目所需的最低限度实现，如果需要较完整的功能建议还是去用大佬的 ↑

目前仅支持：

- TextAsset

```js
import fs from 'fs';
import { loadAssetBundle, AssetType } from '@arkntools/unity-js';

(async () => {
  const bundle = await loadAssetBundle(fs.readFileSync('character_table003334.ab'));
  bundle.objects().forEach(obj => {
    if (obj.type === AssetType.TextAsset) {
      const textAsset = obj.load();
      fs.writeFileSync(`${textAsset.name}.bytes`, textAsset.data);
    }
  });
})();
```
