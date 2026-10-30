# Decksprig

本地优先的演示文稿编辑器：编辑幻灯片、审阅可选的 AI 修改、导出自己的作品。

[**直接试用可编辑示例**](https://decksprig.kens-toolbox.com/app?demo=1) · [演示与视频](https://decksprig.kens-toolbox.com/demo.html) · [中文使用指南](docs/open-source/getting-started.zh-CN.md) · [English](README.md) · [下载 v0.1.8](https://github.com/Ken-pan/decksprig/releases/tag/v0.1.8)

![实际编辑器画面](public/website/assets/editor-light.jpg)

Ken Pan 的个人项目，使用 Codex 开发。当前公开版本为 **0.1.8**；首个公开版本为 0.1.0。代码采用 [MIT](LICENSE)，允许商业使用及闭源二次开发；原创装饰插图在作者持有权利的范围内采用 CC0，字体、图标、第三方素材和品牌标志遵守[各自的许可](ASSET_LICENSES.md)。界面目前为英文。

## 使用指导

- [简明使用指南](docs/open-source/getting-started.zh-CN.md)：从第一次编辑到备份、分享和常见问题。
- [AI 提问示例](docs/open-source/prompt-examples.zh-CN.md)：可直接复制并替换材料。
- [给 AI 的接入指南](docs/open-source/agent-guide.md)：MCP 配置、工具选择、修改约束与结果核验；[AI 阅读入口](llms.txt)。

## 五分钟开始

1. 打开可编辑示例，会在当前浏览器新建一份三页文稿；阅读并关闭导入报告。
2. 在顶部修改文稿名，选中文字并点击 **Edit text**，或双击文字编辑；选中对象后调整右侧属性。
3. 点击 **Present** 演示，按 Escape 返回。
4. 点击 **Document menu → Export document → Deck file** 下载可继续编辑的备份；选择 **PowerPoint** 或 **Web page** 导出分享版本。

这条流程不需要账号、订阅或 API key。浏览器数据只保存在当前浏览器，清理网站数据或更换浏览器前请先导出 Deck 文件。桌面电脑是主要编辑设备。

## 本地运行

需要 Node.js **22.14 或更新版本**、Git 和现代浏览器。普通编辑不需要安装 Keynote 或 LibreOffice。

```sh
git clone https://github.com/Ken-pan/decksprig.git
cd decksprig
npm ci
npm run dev
```

打开 **http://127.0.0.1:4310/**，选择模板、空白文稿或 **Try sample**，并保持终端运行。端口占用时先停止之前的 Decksprig 实例，不要删除数据。

生产模式：

```sh
npm run build
npm start
```

本地文稿、历史和导入原件保存在 `.data/`，浏览器另有恢复草稿。定期导出 Deck 文件；迁移或升级本地安装前，停止应用并备份 `.data/`。在线版与本地版的文稿库相互独立。

## 范围与限制

支持文字、图片、形状、表格、图表、分组、自动布局、模板、字体、插图、备注与动效。可导入 Deck JSON、PowerPoint 和 PDF，导出 Deck、PowerPoint、HTML；PDF 导出通过浏览器打印窗口完成。

PowerPoint 的复杂排版、图表、字体和效果需要在目标软件复核。PDF 以参考渲染和文字提取为主，不保证完整可编辑重建。原始画面和可编辑转换是两种不同结果。原生 Keynote 转换需要本地 macOS 与 Keynote，部分参考渲染另需 LibreOffice。Figma、Google 和 AI 为可选连接，需要自行配置；普通编辑无需这些服务。详见[中文指南](docs/open-source/getting-started.zh-CN.md)与[连接设置](docs/open-source/connections.md)。

AI 请求会将选定文稿上下文、提示和相关工具结果发送给所选提供商；导入远程素材、字体和嵌入内容也可能访问第三方。API key 不应写入文稿或 Git。公开演示没有自动上传文稿的服务，照片搜索代理默认关闭；托管商仍可能记录 IP 和访问路径。详见[隐私说明](PRIVACY.md)。

## 开发与自托管

```sh
npm run licenses:generate
npm run check
npm test
npm run build
npm run build:web
npm run package:source
```

浏览器构建位于 `output/website/dist`。源码包会生成在独立的 `output/open-source/<timestamp>/` 目录，包含逐文件清单与 SHA-256 校验。详见[自托管指南](docs/open-source/self-hosting.md)。本地 Node 服务用于单人回环地址，不应直接暴露到公共互联网。

阅读[贡献指南](CONTRIBUTING.md)、[漏洞报告](SECURITY.md)和[第三方声明](THIRD_PARTY_NOTICES.md)。这是早期版本，欢迎提交使用虚构内容的最小复现；没有商业支持或 SLA。旧的 `deck-studio` 文档标识、存储键和环境变量为兼容性保留。

独立素材项目：[Duoquill 插图](https://github.com/Ken-pan/duoquill) · [Clovlets 贴纸](https://github.com/Ken-pan/clovlets)。

## 更名与迁移

Decksprig 原名 Deckleaf。0.1.1 保留文档格式、`deck-studio-*` 存储标识、素材 ID 和本地 `.data/` 文档库。[旧地址的编辑器](https://deckleaf-kens-toolbox.netlify.app/app)继续用于读取旧地址保存的文档。浏览器存储属于具体域名：请在旧地址导出 Deck 文件，再到新地址导入；域名间不会自动转移文档。详见[迁移说明](docs/open-source/name-change.md)。

## 分包发行

运行 `npm run package:distribution`，会在新的 output 目录生成应用、网站和导出源资源三个独立目录、tar.gz、哈希清单与实际体积记录。应用保留完整可编辑 PPTX/POTX 字体、网页字体及模板原图，离线导出不需要下载源资源包。原始 TTF、源清单、许可证和字体制作输入保存在独立源包中，仓库原件保留。`npm run build:website` 单独构建网站，已有 `build:web` 保留组合托管布局。
