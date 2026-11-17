# 人物与场景库 · 试点

三个固定身份：卷发圆镜、齐肩短发、短发轮椅；每个身份覆盖搜索、填表、错误恢复三个场景。搜索场景还提供满意表情、卫衣与眼镜状态，共 18 张透明 PNG。

原图在 png/，每张图的脸与手、衣服、头发区域蒙版在 masks/；manifest.json 保留身份、场景、版本、尺寸与原图 SHA-256。receipts/ 保存内置 imagegen 的实际提示词、参考图与输出路径。身份依据来自既有蓝黑图库，试点图是新版本；不覆盖旧图库的任何原图。

打开 /characters.html，或 Deckleaf 素材库中的“人物与场景”。只提供两个颜色：皮肤色独立设置，衣服与道具共用一个强调色。头发保持当前原图的颜色、形态和描边，不提供发色定制。恢复原版肤色和钴蓝强调色返回原始 PNG 字节。白袜、白色椅面、手持卡片与页面道具不属于肤色区域。

可直接切换的版本以实际保存的素材为准。尚未制作的发型、耳饰、外套、复杂姿势或组合，通过“生成新版本”保存到本机 .data/character-requests，状态明确为待生成、待审阅。目前没有配置网页内的任意生图服务；保存请求不会被标记为生成成功。

保存的配色变体在 .data/character-variants，保留 PNG 与配方。导入 Deck 后，透明 PNG、来源、原图哈希与定制配方一同进入文稿；从设计面板“定制角色”重新调整，应用可以撤销。PNG、PPTX 与独立 HTML 使用嵌入的实际图片。

生成的表情/服装/眼镜版本是独立图像，经过全套对照检查；不是像素不变的面部或服装图层替换。当前只开放单人场景，未开放双人独立修改。原图以浅色背景为主。素材未声明为第三方 CC0 资源。

依据：[Adobe 非破坏性编辑](https://helpx.adobe.com/ca/photoshop/using/nondestructive-editing.html)、[IBM 人物插画规范](https://www.ibm.com/design/language/illustration/people/)。

## 扩展与质量门槛

- `library-source.json` 是编辑入口，`manifest.json` 是构建产物。身份有稳定 ID、身份版本和固定参考图；场景与角色分开定义，不再写死在界面或构建脚本中。
- `autoMasks` 仅适用于当前正面、蓝黑白试点。头部范围、手部种子点和服装范围使用 0–1 坐标。新增角度、复杂道具或多色衣服时，不要套用现有几何规则：在 `variants` 中声明 `maskMode: "authored"`，提供 skin/clothes/hair 三张同尺寸 PNG 蒙版和实际原始色板。蒙版 alpha 表示覆盖强度，可使用软边；蒙版不能重叠或覆盖完全透明的背景。道具强调色目前仍使用钴蓝原色。
- 生成回执仍放在 `receipts/`，字段包括 characterId、scene、expression、outfit、accessory、prompt 和参考图。新图永远使用新版本 ID；不覆盖已发表的 PNG。
- `npm run characters:build` 先验证完整结构，再发布目录。构建成功只证明结构有效，不代表人物、解剖或局部区域的视觉质量合格。未审阅素材不出现在即时组合中。
- 检查身份、解剖、透明边缘、三个区域和非编辑道具后，记录显式审核：

```sh
npm run characters:review -- --variants=yun-search-confused-shirt --reviewer=Ken --evidence=output/characters/review.png --checks=identity,anatomy,alpha,regions
npm run characters:build
```

`reviews.json` 保存审核人、证据、时间及原图/全部蒙版 SHA-256；修改任何原图或蒙版都会使旧批准失效。审核命令只是记录已完成的视觉检查，不会替人完成检查。身份特征变动时递增 identityRevision，并重新检查对应版本；新版本需同时参考身份母版和场景原图。

表情、服装和配饰控件只切换其他属性保持不变的组合；缺少的组合转为待生成请求。完整版本缩略图仍允许显式选择另一套已制作的组合。换人物/场景时使用稳定匹配并显示发生变化的属性。皮肤色与衣服/道具强调色互相独立，不绑定角色身份。

保存的变体是不可变 PNG 快照，带图片哈希、尺寸、标签与配方。预览、下载、收藏和导入 Deck 使用快照，即使源版本下架也不重渲染。调整快照后保存为新记录；损坏的本机元数据会单独提示，原文件不被删除。renderVersion 1/2 保留老文稿、旧配方和已有快照，不做批量迁移；新调整使用 v3，强制衣服与道具共享色值，完全跳过头发改色。兼容字段 hairColor/accentColor 继续读取旧记录，但新版本不能独立调整它们。打开旧快照仍显示原先保存的 PNG，开始新的颜色调整后才生成两色版本；文稿只在明确应用时更新，支持撤销。

自动蒙版试点会从已确认的区域内部计算实际底色中位数，保存为 calibration，避免生成图与标称蓝色的小偏差导致浅衣色偏灰。v3 还校准道具的实际蓝色底色，使它与衣服共享同一目标色；深色线条不作为蓝色道具处理。人工蒙版则使用声明的原始色板，不套用试点的衣服颜色估计。预览可复用有上限的缓存，源图或蒙版改变时缓存失效。头发蒙版保留用于旧版本兼容、像素保护和审核，不删除原素材。

生成请求冻结身份母版、身份版本和场景来源哈希，仍为 pending-generation；没有接入网页内自动生图或自动批准。当前配方是单人物，不宣称支持多人物独立编辑。以后增加双人场景应使用新 schema 和按人物槽位的独立蒙版，不能复用同一个单人物区域来改两个人。

## Reuse permission

Ken Pan dedicates any rights he holds in the project-generated artwork in this pack to the public domain under CC0 1.0, effective 14 October 2026: https://creativecommons.org/publicdomain/zero/1.0/. Commercial use, modification and redistribution are allowed without attribution. AI output may be non-exclusive or unprotected in some jurisdictions. Original bytes, generation evidence and SHA-256 hashes are preserved. This grant does not cover third-party rights, trademarks, privacy or publicity rights. See ASSET_LICENSES.md and the bundled CC0 legal text.
