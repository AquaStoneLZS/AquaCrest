# 第三方代码声明

AquaCrest 的模型权重、特征编码与推理代码以 [LICENSE](LICENSE)（MIT，Copyright (c) 2026 Guanjing（观景台））发布。以下组件的版权归各自作者，完整许可原文保留在对应位置，不能由本摘要代替。

## osumania_map_analyser（Azusa 局部压力、谱面解析、曲线平滑）

- 来源：[LeoBlackMT/osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser)，固定版本 `a3be62228668d2e5bfd56595f447791548983893`
- 许可：MIT，Copyright (c) 2026 Leo_Black，原文 [src/public/vendor/mania-analyser/LICENSE](src/public/vendor/mania-analyser/LICENSE)；发布 ZIP 内为 `UPSTREAM-AZUSA-LICENSE`
- 本仓库使用的文件：

| 文件 | 说明 | SHA-256 |
| --- | --- | --- |
| `parser/osuFileParser.js` | 上游原文件 | `e4ee6debe687bffc77a3d755a8526e27dd758d6ff74df8da74e6a8dd65c1cf0c` |
| `parser/noteColumn.js` | 上游原文件 | `f700e90298532d23a0b2585119ff4150c442fcb17aa31e37c32d96f1fa480db2` |
| `rework/reworkMathCore.js` | 上游原文件 | `d15f6c9f60f0f24d959a3cc332a385c738024300b7b1b70e512c7f8e6ece6521` |
| `azusa-local-core.js` | 从上游 `estimator/azusaEstimator.js` 原样提取本地压力函数的生成文件，文件头保留版权声明 | `6ce7323e305ba5f42f3496b0ef6addafb7ce7417d77d8e869263b5a909e3e0f9` |

三个上游原文件的哈希与观景台仓库 `public/vendor/mania-analyser/manifest.json` 中的记录一致。AquaCrest 把 Azusa 局部压力曲线作为特征来源之一，不把压力值直接当作定数。

## mania-preview-browser-extension（osu!mania 谱面解析）

- 来源：[2419445078-hash/mania-preview-browser-extension](https://github.com/2419445078-hash/mania-preview-browser-extension)
- 许可：MIT
- 使用位置：`src/frontend/shared/beatmap-parser.js`，原样使用，文件头保留出处

