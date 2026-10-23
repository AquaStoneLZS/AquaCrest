# 在观景台中使用 AquaCrest

观景台（<https://guanjingscene.xyz>）内置 AquaCrest 1.0.0，打开网页即可使用，不需要下载本仓库。谱面和模型都在浏览器本地计算，不会上传到服务器。

| 入口 | 地址 | 用法 |
| --- | --- | --- |
| 主站 AI 难度分析 | 首页导航「AI 难度分析」 | 难度模型选「AquaCrest 1.0.0」，与 Mixed、Koishi 对照，查看有效段、A/B 与 RC 段位名称 |
| 单谱难度页 | [/pattern-difficulty/](https://guanjingscene.xyz/pattern-difficulty/) | 上传 `release/AquaCrest-1.0.0.zip` 作为本地模型，查看耐力、锚度和结构压力 |
| Benchmark | [/benchmark/](https://guanjingscene.xyz/benchmark/) | 选择「AquaCrest 1.0.0 · 原始 SVR」，在公共基准上比较算法误差 |

所有入口的共同限制：只计算 4K 谱面，至少 80 个note，长条占比超过 18% 时不计算并显示原因。

## 主站 AI 难度分析

1. 在首页导航点「AI 难度分析」。
2. 选择或拖入谱面，支持 `.osu`、`.osz`、`.zip` 和 Malody 的 `.mc`、`.mcz`；压缩包中有多个难度时再选择其中一个。
3. 「难度模型」选 **AquaCrest 1.0.0**。
4. 点击「开始本地分析」。大谱面可能需要几十秒，可以点「取消计算」。
5. 完成后可「导出分析 JSON」，其中记录模型版本与权重 SHA-256。

难度数值同时换算成 RC 段位名称，并参与有效段、E/F/A/B 等主站分析。AI 文字评析需要另行主动调用，评析依据的是本地计算结果。

## 单谱难度页（上传模型 ZIP）

单谱难度页内置的 AquaCrest 不是 1.0.0。要在这里使用 1.0.0，上传本仓库的 `release/AquaCrest-1.0.0.zip`：

1. 打开 [/pattern-difficulty/](https://guanjingscene.xyz/pattern-difficulty/)，在「本地模型」区域点击或拖入 ZIP。
2. 状态显示「已载入 AquaCrest」后，「难度算法」自动切换为「AquaCrest · 本地模型」。
3. 点击或拖入一个 `.osu` 谱面（不超过 15 MiB）。拖入后不会自动计算。
4. 「播放倍速」填 0.25–3。谱面文件本身已经是倍速版本时保持 1.0。
5. 点击「测定谱面 ↗」，计算中可以点「取消」。
6. 「清除本地模型」或刷新、离开页面即释放模型。

结果包括：

- **难度**：AquaCrest 1.0.0 定数；
- **E / F**：AquaTide 耐力与 AquaReef 锚度，以及按网站公式换算的评分，由网站另行计算；
- **辅助键型**：由 Koishi 识别，与 AquaCrest 难度无关；
- **结构压力分项**：原始结构指标，各项尺度不同，适合在不同谱面之间比较同一项。

「导出完整分析 JSON」与「导出指标 CSV」会记录本地模型名称。页面上的验证记录不适用于上传的模型；模型结构、训练方式与使用限制见[模型说明](model.md)。

## Benchmark

打开 [/benchmark/](https://guanjingscene.xyz/benchmark/)，在算法选择中选「AquaCrest 1.0.0 · 原始 SVR」，与其它算法对比误差分布、偏向、键型差异和逐谱明细，并导出结果。页面结果不能直接作为该模型的独立盲测准确性证明。

也可以在「本地模型评测」中上传 `release/AquaCrest-1.0.0.zip` 重新跑一遍：

1. 点「上传模型 ZIP」。
2. 选择线程数（每个线程各加载一份模型，约 17 MB 权重会被复制）。
3. 点「开始本地评测」；可取消，取消时不保留部分结果。

## 模型 ZIP 格式

`release/AquaCrest-1.0.0.zip` 是观景台「本地模型 ZIP · API v1」格式，也可用于在网站上运行自己修改后的 AquaCrest，无需部署网站。

```text
manifest.json          format=guanjing-benchmark，apiVersion=1，entry=model.js
model.js               单文件 ES module，导出 init(context) 与 predict({osuText, chart, rate})
weights.bin            与 model.bin 相同的权重
model-metadata.json    完整元数据
LICENSE、THIRD_PARTY_NOTICES.md、UPSTREAM-AZUSA-LICENSE
```

- ZIP 不超过 128 MiB，单个条目不超过 64 MiB，至多 512 个条目，只支持 Store/Deflate；
- 模型在隔离的 sandbox Worker 中运行，不能联网、不能读取网站资源，所有代码和权重都必须在包内；
- 初始化和每次预测各限时 30 秒；
- `predict` 返回有限数值或 `null`。长条超过 18% 等不支持的谱面会抛出原因，页面显示为未测定。

修改模型后，在本仓库运行 `npm test` 与 `npm run package`，把 `build/AquaCrest-<版本>.zip` 上传即可。

## 把模型更新回网站

`src/` 与观景台仓库路径一一对应：`src/frontend/**` 对应网站仓库 `frontend/**`，`src/public/vendor/**` 对应 `public/vendor/**`。网站仓库的 AquaCrest 推理代码同时兼容其它版本，同步前先对比差异，不要直接整体覆盖：

1. 把修改后的 `aqua-1-crest/` 文件（含 `model.bin` 与 `model.js` 元数据）合并到网站仓库对应位置；
2. 使用本仓库的合成谱面生成器与回归快照检查同步后的推理结果；
3. 按网站仓库的开发约定构建并运行回归与浏览器检查，Benchmark 快照需要重新计算。

网站上线流程以观景台仓库的开发文档为准。
