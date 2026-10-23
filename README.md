# AquaCrest

AquaCrest 是[观景台](https://guanjingscene.xyz)的 osu!mania **4K 难度计算模型**。输入一份 `.osu` 谱面，输出一个连续的难度数值。

当前版本 **1.0.0**：924 维特征的 RBF 核 SVR，推理完全在浏览器或 Node 中本地完成，不需要 Python 或服务器。

| 项目 | 内容 |
| --- | --- |
| 适用范围 | 原生 mania 4K（Mode:3、CircleSize:4），至少 80 个note，长条占比不超过 18% |
| 输入 | 只用谱面内容：音符、长条结构、timing、AquaTide/AquaReef 指标、Azusa 局部压力曲线；曲名、作者、文件名、标签不进入特征 |
| 倍速 | 0.25–3，先把谱面时间换算到目标倍速再推理 |
| 输出 | 难度定数 |
| 权重 | `model.bin`，16,790,576 字节 Float64，SHA-256 `cc87da93…12c3c72c` |
| 许可 | MIT，见 [LICENSE](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md) |

## 文档

- [模型说明](docs/model.md)：特征、结构、权重布局、训练方式、本地实现检查与使用限制
- [在观景台中使用](docs/website.md)：网站各入口的操作方法、本地模型 ZIP 上传、把模型更新回网站

## 快速开始

需要 Node.js 22 或更高版本。推理与测试没有运行时依赖。

```sh
node scripts/predict.mjs path/to/chart.osu
```

```sh
node scripts/predict.mjs path/to/folder --rate 1.2 --output result.json
```

可选参数：`--rate <0.25–3>`、`--full`（额外输出全部 924 个特征与结构压力明细）。输出示例：

```json
{
  "status": "OK",
  "algorithm": "AquaCrest",
  "version": "1.0.0",
  "rate": 1,
  "difficulty": 3.540284342065476,
  "indices": { "E": 84.61188139939891, "F": 110.78807670529335 },
  "curvePoints": 2400,
  "warnings": []
}
```

不在适用范围内的谱面返回 `status: "Invalid"` 和原因（例如 `UnsupportedLN`）。

在代码中调用：

```js
import {analyze, loadEvaluator} from './scripts/model.mjs';

const model = loadEvaluator();
const result = await analyze(osuText, {rate: 1, model});
console.log(result.difficulty);
```

浏览器中以 ES module 导入 `src/frontend/shared/analysis/aqua-1-crest/browser.js`，调用 `analyzeCrestForPage(osuText, {rate})`；它会从同目录读取 `model.bin`、校验 SHA-256，并在页面内缓存。`src/` 需要通过 HTTP 提供，`file://` 下无法读取权重。

## 检查

```sh
npm test
npm run verify
```

`npm test` 覆盖程序生成的合成谱面回归、倍速、长条范围、权重加载与发布 ZIP。`npm run verify` 校验权重哈希、合成谱面输出快照、发布 ZIP 与其清单。这些检查验证实现一致性，不代表独立难度准确性评估。

重建本地模型 ZIP（需要 `npm install` 安装 esbuild）：

```sh
npm run package
```

输出到 `build/`，与 `release/AquaCrest-1.0.0.zip` 逐字节相同。

## 目录

```text
src/                      与观景台仓库路径一一对应，便于双向同步
  frontend/shared/analysis/aqua-1-crest/   AquaCrest 本体：推理、特征、元数据、权重 model.bin
  frontend/shared/analysis/aqua-ef-01/     AquaTide（耐力 E）/ AquaReef（锚度 F），作为输入特征
  frontend/shared/analysis/pattern-difficulty/  结构特征（键型、手部、长条负荷）
  frontend/shared/analysis/azusa/          Azusa 局部压力曲线与倍速换算
  frontend/shared/analysis/difficulty-scope.js  长条 18% 范围检查
  frontend/shared/beatmap-parser.js        .osu 解析
  public/vendor/mania-analyser/            第三方 Azusa 压力与解析代码（MIT，Leo_Black）
release/                  观景台本地模型 ZIP（API v1）、哈希、完整元数据
scripts/                  Node 推理入口、命令行、校验与打包
test/                     单元测试、合成谱面生成器与回归快照
docs/                     模型说明与网站使用
```

模块间相对导入与观景台仓库保持一致。模型元数据与训练方式见模型说明。
