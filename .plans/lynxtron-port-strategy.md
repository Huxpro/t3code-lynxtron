# Electron → Lynxtron 后续移植计划

更新日期：2026-07-29

## 1. 目标

把当前 Electron/Web 产品系统性地移植到 monorepo 内的
`apps/lynxtron`，同时满足：

1. Electron/Web 是视觉、交互、文案和状态的唯一产品基准；
2. Web 与 Lynx 尽可能编译同一份物理源文件，而不是维护两套相似 UI；
3. Lynx 使用 Tailwind CSS v3 和 `@lynx-js/tailwind-preset`，Web 保持
   Tailwind v4；
4. code/editor、terminal、embedded browser 保留产品级 placeholder；
5. 原生 `<list>` 聊天与全局键盘是必须交付的高优先级能力；
6. 所有差异都有兼容矩阵、证据、owner 和移除条件。

本计划是以下材料的后续执行总纲：

- `/Users/bytedance/github/t3code-lynxtron/docs/PORTING_STRATEGY.md`
- `apps/lynxtron/docs/plans/00-execution-index.md`
- `apps/lynxtron/docs/plans/05-fidelity-foundation.md`
- `apps/lynxtron/docs/plans/06-core-surface-convergence.md`
- `apps/lynxtron/docs/plans/07-desktop-interaction-convergence.md`
- `apps/lynxtron/docs/plans/08-certification-and-handoff.md`
- `apps/lynxtron/docs/implementation-status.md`
- `apps/lynxtron/docs/port-ledger.md`
- `apps/lynxtron/docs/compat-matrix.md`

## 2. 当前基线

### 已完成且应保留

- monorepo 内的 `apps/lynxtron`、host、preload、connector 和构建链；
- `.web.ts(x)` / `.lynx.ts(x)` 平台解析；
- workspace contracts、Effect RPC、Effect Atom 和 canonical state；
- Web API/CSS audit、物理复用报告、Electron/Web ↔ Lynx DevTool 截图链；
- Tailwind v3 Lynx PostCSS 管线；
- Settings General 参考屏：
  - feature panel：75% module / 73.4% line reuse；
  - complete route：71.4% module / 70.1% line reuse；
  - 两个 viewport、四种生命周期状态通过视觉和交互认证；
- Sidebar V1 的 Create、Rename、Archive、Delete、Select 等 canonical action
  已在真实 Lynxtron 中验证。

### 当前严格结果

| Product surface | Module reuse | Line reuse | 状态 |
| --- | ---: | ---: | --- |
| App shell / Sidebar | 27.5% | 36.0% | 未达标 |
| New-thread empty state | 21.8% | 26.5% | 未达标 |
| Existing thread / transcript | 21.8% | 26.5% | 未达标 |
| Composer | 3.9% | 3.5% | 未达标 |
| Model Picker | 2.0% | 2.7% | 未达标 |
| Settings General | 71.4% | 70.1% | 已认证 |
| Settings Providers | 3.9% | 3.0% | 未达标 |

### 当前关键缺口

- 主入口仍直接组合大量 `apps/lynxtron/src/app/components/*`；
- `MessagesTimeline` 仍使用 `<scroll-view>`，不是原生 `<list>`；
- Lynx keyboard capability 仍为 `available: false`；
- `overrides.css` 有 3,776 行，生成 CSS 只有 128 行；
- Sidebar V2 eager inclusion 触发 Effect main-thread/snapshot 错误；
- Lynxtron 0.0.5 无法解析 Sidebar V2 的相对 async bundle URL（R11）；
- RouterProvider、preload push、SVG、字体、Selection、patch renderer 等
  runtime gaps 仍存在；
- 当前改动横跨大量 modified/deleted/untracked 文件，尚未形成可审查边界。

## 3. 对旧执行顺序的修正

旧计划把整个 T6-C1 完成作为后续工作的串行前置条件。现在确认：

- 默认 Sidebar V1 已经可运行；
- Sidebar V2 是独立 Beta 功能，并受 R11 和 Effect runtime failure 阻塞；
- `<list>` 聊天和键盘才是当前产品价值最高、最影响架构的工作。

因此采用以下新规则：

1. **默认 V1 产品路径与 Sidebar V2 分开验收。**
2. **Sidebar V2 标记为 `blocked-runtime(R11)`，不得阻塞普通 UI。**
3. **原生 `<list>` 与键盘能力提前，不能等所有静态 UI 完成后再做。**
4. **每次只保留一个产品集成 slice 在 `in_progress`；runtime probe 可以是
   有明确时限和产出的 capability spike。**
5. **“数据能用”不再记为 surface 完成。**

新的 surface 状态：

- `data-functional`
- `physically-shared`
- `visual-certified`
- `interaction-certified`
- `placeholder-approved`
- `blocked-runtime(Rx)`

只有 `visual-certified` 与 `interaction-certified` 都通过，普通产品面才算完成。

## 4. 固定约束

### 产品与代码来源

- Electron/Web 是唯一 fidelity target；
- 独立 `t3code-lynxtron` 只用于 provenance 和历史行为研究；
- 不以独立仓截图作为验收目标；
- copied JSX、重命名文件和相似实现不算 source reuse；
- 生成 CSS 只算 `PATCHED`，不算 `SHARED`。

### Placeholders

允许 placeholder：

- code/editor content；
- terminal emulation；
- embedded browser runtime。

仍必须实现：

- panel/tab chrome；
- canonical state、label 和 command；
- open/close/activate/fallback；
- placeholder 的明确产品文案和视觉状态。

不允许 placeholder：

- 全局键盘；
- overlay 的 Escape/Enter/Arrow 行为；
- 完整原生 `<list>` 聊天；
- transcript scrolling、streaming 和 restore-position 行为。

### Tailwind 与 CSS

- Lynx 只运行 Tailwind CSS v3；
- Web Tailwind v4 不得被 Lynx build 调用；
- Tailwind content 必须扫描真实共享 Web/Lynx composition；
- unsupported selector/declaration 必须进入报告和兼容矩阵；
- 每完成一个共享 surface，必须删除对应的 prototype/BEM CSS；
- `overrides.css` 中新增规则必须说明：
  - 所属 surface；
  - 对应 R#；
  - remove-when；
- `overrides.css` 总行数在每个 UI slice 后必须净下降；
- 不允许为了截图继续堆叠无 owner 的手写样式。

## 5. 执行阶段

## P0：保护现状并建立可审查边界

目标：用一个短周期把当前工作变成可安全继续的基线，不扩展产品范围。

### P0-S1 当前状态快照

- 记录 HEAD、dirty manifest 和关键报告 hash；
- 更新 reuse report 的生成时间、screen 数量和当前指标；
- 清理文档中已经过时的“first baseline”描述；
- 不删除、不 reset、不覆盖现有用户工作。

### P0-S2 拟议 review units

只形成 review/commit 建议，不在没有用户授权时 stage 或 commit：

1. host、preload、connector、build；
2. `packages/client-runtime` / `packages/shared` 的中立逻辑；
3. Web behavior-preserving extraction；
4. `.web` / `.lynx` primitives 和 capabilities；
5. Lynx product integration；
6. Tailwind/generated assets；
7. tests、reports、evidence 和 docs。

### P0 exit

- 所有删除的 Web 文件都有明确 replacement；
- authored、generated、evidence、disposable output 已分类；
- 后续每个 slice 可以独立 review 和回退；
- 不要求提交，但必须能提出安全的 patch series。

## P1：完成默认 App Shell / Sidebar V1

目标：不让 Sidebar V2 runtime gap 阻塞默认产品路径。

### P1-S1 隔离 Sidebar variant

建立明确的 platform boundary，例如 `SidebarVariantBoundary`：

- Web 保持当前 V1/V2 产品行为；
- Lynx 默认只让 V1 进入 reachable product graph；
- V2 在 Lynx Beta settings 中明确显示 runtime limitation；
- 不通过修改 reuse exclusions 隐藏 V2；
- 通过真实 import graph 或 build entry 隔离 V2。

如果必须在 Lynx 提供 V2：

- 优先尝试两个静态主 bundle，由 host 在启动时选择；
- 禁止继续依赖 Lynxtron 0.0.5 无法解析的相对 async bundle；
- eager V2 必须先解决 `onItem` / snapshot failure。

### P1-S2 收敛最大 exclusive modules

按当前 product graph 逐个处理最大 exclusive source：

- `composerDraftStore.ts`
- `SidebarV2.tsx`（隔离或 blocked）
- `GitActionsControl.tsx`
- `session-logic.ts`
- connection/runtime modules

每个模块只采用以下一种终态：

1. 整文件共享；
2. 抽纯逻辑后共享；
3. 小型 platform capability；
4. 有证据的 Lynx host leaf；
5. 明确 blocked runtime island。

不得为提高百分比排除真正可达的产品依赖。

### P1-S3 认证默认 shell

覆盖：

- empty / populated / collapsed / long-title；
- create / select / rename / archive / delete；
- busy / archived / reconnecting；
- 两个标准 viewport；
- Electron/Web 与 Lynx 同一 snapshot。

### P1 exit

- 默认 V1 App Shell product-surface module 和 line reuse 都 ≥ 70%；
- anchors ≤ 8 px，font-size ≤ 2 px；
- content/order/count exact；
- Sidebar V2 明确完成、placeholder-approved 或 `blocked-runtime(R11)`；
- 默认路径零 Lynx renderer error。

## P2：原生 `<list>` 聊天

这是下一项最高优先级产品工作。

### P2-S1 共享 transcript model

从 Web 抽出 renderer-neutral projection：

- message/activity/plan/checkpoint grouping；
- stable item identity；
- role、status、timestamp、streaming state；
- assistant work log 和 plan card placement；
- prepend batch 和 update revision；
- Markdown input model。

Web 与 Lynx 必须使用同一 projection 和测试 fixtures。

### P2-S2 Lynx `<list>` host

Lynx leaf 只负责：

- `<list>` / list item host elements；
- item recycling；
- viewport/scroll callbacks；
- visible range；
- scroll-to-item；
- measurement/runtime-specific state。

禁止继续用 `<scroll-view>` + 全量 `messages.map()` 作为最终实现。

### P2-S3 Scroll state machine

实现并测试：

- 初次进入定位到底部；
- streaming 时自动跟随；
- 用户上滚后 detach；
- 用户回到底部后重新 follow；
- prepend 历史记录后保持视觉锚点；
- thread 切换时保存/恢复位置；
- interrupted/failed/proposed-plan 增量更新；
- 1、100、1,000 条记录下的 recycling 和内存行为。

### P2-S4 Markdown bounded island

- 继续共享 fence/list/task/inline/file-link projections；
- Lynx host 渲染器保留为 bounded island；
- tables、nested blocks、selection 等缺口必须显式登记；
- copy 和 file/external navigation 必须可用。

### P2 exit

- 完整 transcript 使用原生 `<list>`；
- long/streaming/interrupted/failed/proposed-plan fixtures 通过；
- follow/detach/prepend/restore 行为有功能证据；
- transcript 普通 UI 达到 70% reuse gate；
- 两个 viewport 有 Electron/Web ↔ Lynx DevTool 证据。

## P3：全局键盘与焦点

与 P2 同级高优先级，但实现时保持一个 bounded capability slice。

### P3-S1 Runtime probe

确认并记录 Lynxtron 0.0.5：

- Lynx element key events；
- `LynxWindow` 的 window-level input events；
- Menu accelerator；
- main → renderer `sendGlobalEvent`；
- focus、Tab 和 text input 行为；
- keydown/keyup、modifier 和 repeat。

不得仅根据类型声明推断支持。

### P3-S2 Event contract

在共享包定义 renderer-neutral keyboard packet：

- `type`
- `key`
- `code`（可用时）
- `metaKey` / `ctrlKey` / `altKey` / `shiftKey`
- `repeat`
- `source`
- monotonic sequence

事件统一进入现有 shared keybinding resolver，不在 Lynx 维护第二套命令映射。

### P3-S3 Host/native bridge

优先路径：

1. window-local native input；
2. main process normalize；
3. `LynxWindow.sendGlobalEvent`；
4. Lynx `clientCapabilities.keyboard.subscribe`；
5. shared command resolver；
6. active overlay/focus dispatcher。

Menu accelerator 可以先覆盖离散 app commands，但不能冒充完整键盘：

- 不能替代 Tab/focus；
- 不能替代输入框内 Enter/Escape；
- 不能替代 arrow navigation；
- 不使用系统级全局快捷键代替窗口内事件。

### P3-S4 Shortcut and focus matrix

至少覆盖：

- new thread；
- Quick Switch / Command Palette；
- Model Picker；
- send / interrupt；
- Escape 关闭最上层 overlay；
- Enter / Space activate；
- Arrow navigation；
- Tab / Shift+Tab focus order；
- thread jump；
- panel toggle；
- placeholder terminal/browser/editor 的 chrome commands。

### P3 exit

- `clientCapabilities.keyboard.available === true`；
- keydown/keyup/modifier/repeat 有真实运行时证据；
- overlay/focus/shortcut matrix 全部有 pass 或明确 runtime block；
- UI 不显示未经验证的 shortcut hint；
- R5 关闭，或只剩有 owner 的上游 runtime patch。

## P4：核心聊天与 overlays

按以下顺序推进：

1. New-thread empty state；
2. Composer chrome 和 dispatch；
3. Model Picker；
4. Quick Switch / Command Palette；
5. ChatHeader / banners / plan cards；
6. Markdown 剩余普通语法。

执行规则：

- 先编译真实 Web subtree；
- 选择最大共享 composition；
- 只切不兼容叶子；
- editor core 使用明确 placeholder；
- toolbar、model/provider/runtime/interaction/branch/checkout state 必须 canonical；
- overlays 必须有 open/search/select/dismiss/no-result/disabled evidence；
- keyboard 验收使用 P3 能力，不再以 visible button 降级完成。

每个 surface 单独达到：

- module reuse ≥ 70%；
- line reuse ≥ 70%；
- anchors ≤ 8 px；
- font-size ≤ 2 px；
- exact content/state；
- pointer + keyboard interaction pass。

## P5：Settings 与 panels

### Settings

以 Settings General 为模板依次完成：

1. Providers；
2. Connections；
3. Source Control；
4. Keybindings；
5. Beta；
6. Archive。

每个可变 control 必须读写 canonical authority，不展示 inert control。

### Panels

完成：

- Files tree/save state；
- checkpoint/change summary；
- Plan panel；
- Right panel stack；
- placeholder editor；
- placeholder terminal；
- placeholder embedded browser。

Full patch renderer 保持 R10 island，不得阻塞普通 panel chrome。

### P5 exit

- 每个 Settings route 单独达到 reuse/fidelity/interaction gates；
- panel open/activate/close/fallback/resize 有证据；
- file dirty/saving/saved/error/retry 有证据；
- placeholder 与真实功能边界清晰；
- 无旧 clean-room screen 仍从产品导航可达。

## P6：桌面交互、系统状态与最终认证

完成原 T7/T8：

- hover/active/focus/disabled；
- overlay geometry 和 dismissal；
- resize/density/theme/motion；
- startup/connecting/reconnecting/offline/fatal；
- empty/loading/streaming/interrupted/failed/retry；
- packaged application smoke；
- final provenance/reuse/fidelity matrix；
- obsolete prototype path 清理；
- completion report。

普通 UI 完成条件：

- 每屏 module/line reuse ≥ 70%；
- 两个标准 viewport 通过；
- keyboard 和 `<list>` 功能证据通过；
- 零未登记 major difference；
- 零 renderer error；
- runtime islands 都有 owner、fallback 和 remove-when。

## 6. 每个 slice 的固定流程

1. 记录当前 HEAD、dirty identity 和 active task；
2. 编译原始 Web entry/subtree；
3. 记录第一个 compiler/runtime failure；
4. 选择最大共享 composition；
5. 只实现最小 platform leaf/capability；
6. 删除被替代的 Lynx clean-room component/CSS；
7. 跑 focused tests；
8. 跑 affected typecheck；
9. 跑 Lynx CSS/API audits；
10. 跑 production build；
11. 跑 ReactLynx scanner；
12. Web user-visible 变化跑一次 isolated integrated verification；
13. Lynx user-visible 变化跑一次真实 Lynxtron verification；
14. 使用 Lynx DevTool 截图；
15. 生成同 snapshot reuse/fidelity evidence；
16. 更新 ledger、matrix、status 和 exact next task。

如果 product-surface reuse 提升少于 1 个百分点，停止继续抽小 helper，重新选择更大的
composition boundary。

## 7. 度量与报告规则

四个结果独立报告：

1. style generation；
2. physical source reuse；
3. visual/content fidelity；
4. interaction/runtime behavior。

禁止：

- 用 build success 表示功能完成；
- 用 screenshot 相似表示 source shared；
- 用 data-functional 表示 visual-certified；
- 改 exclusion/mask 改善数字；
- 用 surface-only graph 替代 product-surface gate；
- 用独立仓截图作为 Electron fidelity 证据。

`reports/reuse/current.json` 必须记录：

- generated timestamp；
- worktree identity；
- resolver fingerprint；
- screen count；
- boundary hash；
- route/product/local 三种 graph；
- largest exclusive modules；
- registered islands。

## 8. 下一步

唯一推荐的下一产品任务：

**P1-S1：隔离默认 Sidebar V1 与 Sidebar V2 runtime block。**

完成后立即：

1. 重跑 App Shell product graph；
2. 处理最大 exclusive modules；
3. 认证默认 V1；
4. 开始 P2 原生 `<list>` transcript；
5. 随后执行 P3 keyboard capability。

不要继续扩充独立 Lynx 组件，不要先实现 editor/terminal/browser 内核，也不要在
Sidebar V2 的 async bundle 失败上无限循环。
