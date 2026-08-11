# 借鉴 Synara 重建 Harness、清理上下文并冻结下一阶段优先级

> **Historical plan snapshot.** This file records the Plan 11C design and its
> 2026-08-04 execution model. The current authority is
> [`../harness/current-state.md`](../harness/current-state.md) and
> [`../harness/completion-audit.md`](../harness/completion-audit.md). The old
> 39-state evidence archive is not current final5 certification.

Plan 11C 是一个 **harness 与执行上下文重置阶段**。它不继续堆叠页面实现，也不把现有
Browser Preview、截图数量或绿色脚本误当成产品完成度。它先从 Synara 已经验证过的
Web / Lynx-for-Web / Lynxtron Native 工作流中提炼可复用方法，重建 T3 Code 的证据模型、
差距识别和 monorepo source-reuse 审计，再用当前产品真实差距生成下一阶段 port 的优先级。

本计划执行完成前：

- 不开始新的广泛 UI port；
- 不把 Plan 11A / 11B 的 `PASS` 当成 visual parity；
- 不根据历史截图、旧 baseline 或旧 gap log 直接决定下一刀；
- 不删除未分类的 dirty worktree 或证据文件。

## Plan metadata

- Content type: How-to
- Status: Historical; archaeology reconciled 2026-08-12
- Audience: 继续 T3 Code Electron-to-Lynxtron port 的 agents
- Goal:
  1. 建立可重复、可审计、能诚实区分 harness failure 与 product gap 的三端 Harness；
  2. 建立 UI fidelity residual atlas，识别真实差距并为下一阶段 port 排优先级；
  3. 建立 route-graph physical source reuse 与 style coverage 审计；
  4. 清理当前仓库中会继续误导执行的计划、状态、证据和诊断上下文。
- Product authority: 当前 checkout 中真实运行的 T3 Code Web/Electron
- Fast development surfaces: 真实 Web app + Lynx-for-Web，共用一个 isolated T3 server
- Final platform authority: exact-owned Lynxtron Native + PID-derived DevTool session
- Scope:
  - `apps/lynxtron` Harness、evidence、plans、reports；
  - `apps/web` 与 `packages/client-runtime` 中为 physical source reuse 必需的最小边界；
  - 真实主要产品状态的 gap inventory 与下一阶段 priority roadmap。
- Out of scope:
  - 本阶段直接完成所有 UI gap；
  - terminal、embedded browser、完整 patch renderer 等既有 hard islands；
  - 为提高截图相似度而复制 Web JSX、硬编码 fixture UI、扩大 masks；
  - 在未明确授权时 commit、push、开 PR。
- Historical branch: `lynxtron-port`
- Historical worktree: `/Users/bytedance/github/t3code`
- Current archaeology branch: `archaeology/final5-20260812`
- Reference implementation:
  - `/Users/bytedance/github/synara/apps/lynx/`
  - `/Users/bytedance/github/synara/shots/2026-08-03/p8-q2/comparison.html`
- Updated: 2026-08-04

## 为什么需要这个计划

当前 T3 Code 工作流已经证明了几个重要事实：

- 真实 Web app 与 Lynx-for-Web 可以连接同一个 isolated server；
- Lynx-for-Web 能作为普通 UI 的快速迭代表面；
- Native 仍然是 input、list、window、host integration 和真实 engine behavior 的最终
  authority；
- monorepo 中已经存在大量 shared composition、client-runtime projection 和 platform
  leaves。

但过去几轮同时暴露出系统性问题：

1. **把 capture validity 当成 visual parity。**
   `semanticReady`、同 server、PNG 尺寸相同、console 为空，只能证明 frame 有效，不能证明
   UI 相似。过去页面把这些 gate 合并成 `PASS`，导致肉眼明显错误的 pane 仍被宣称通过。
2. **先写 gallery，后补 evidence model。**
   当前 comparison 只有少量 viewport cells，没有完整 screen × state × theme × size × client
   manifest，也没有 strict verifier，因此页面无法像 Synara 一样表达缺失、诊断、保留和
   Native 证据。
3. **历史上下文叠加而没有 authority reset。**
   Plan 11A 仍描述已删除的 Web reference host；Plan 11B 又在其上增加 superseding 说明；
   implementation status、port ledger、gap log 和 evidence 目录保留了多轮相互冲突的结论。
4. **gap 没有统一 taxonomy、severity 和 owner。**
   UI 差异常被混成 CSS 问题、runtime gap、proxy limitation 或 live-state difference，无法
   稳定形成下一阶段优先级。
5. **monorepo reuse 主要靠叙述，缺少 route graph 审计。**
   “共享 semantics”“共享 surface”“Lynx import Web”都不等于 physical source reuse。
   需要像 Synara 一样从 Web route entry 计算依赖图，并对每个模块做固定分类。
6. **诊断产物污染正式证据。**
   `BW2/BW3/BW4`、`SB4b/SB4c/SB4d/SB4final` 等目录混合了有效、失效、故障注入和中断
   capture，没有 manifest 声明，后续 agent 很容易再次引用错误 frame。

Plan 11C 的任务不是“再做一个漂亮页面”，而是建立一套不会再次产生上述错误的体系。

## 从 Synara 提炼的可复用经验

### 1. Harness 必须先证明自己

Synara 在保留任何矩阵 frame 前先验证：

- isolated server、state directory、owned PIDs 和 ports；
- Web / Lynx / Native 的 build 与 bundle identity；
- 同 snapshot、同 semantic route、同 theme、同 viewport、同 product state；
- runtime viewport、visual viewport、DPR 和 PNG dimensions；
- Native client 必须由 owned PID 动态解析，不能按 remembered port 或 list order；
- console、state restoration 和 cleanup。

任一 preflight 失败，frame 是 **invalid harness evidence**，不是 product regression。

### 2. 快速循环与最终认证是两套不同产品

- **Fast loop**：真实 Web + Lynx-for-Web，同 server / snapshot / state，适合布局、普通交互、
  typography、tokens、overlays、transcript 与 Composer。
- **Native batch**：exact-owned Lynxtron，适合 Native input、IME、selection、keyboard、
  `<list>`、window、system menus、clipboard/dialog、cold start 和 persistence。

Browser pass 不能升级为 Native pass；Native batch 不应在每个 spacing edit 后重跑。

### 3. Manifest 是证据 SSOT，gallery 只是 reader

Synara 的严格 manifest 对每个 state 声明：

- route、theme、viewport/DPR、snapshot hash；
- selected project/thread/model；
- exact interaction state；
- required / optional clients；
- 每个 client 的 `retained / diagnostic / pending / not-applicable`；
- build hash、PNG dimensions、assertions、console、state echo；
- 缺失原因。

verifier 检查 manifest，comparison gallery 只消费 manifest。禁止把 cases 手写在 HTML 中。

### 4. Comparison 是审计产品，不是截图列表

Synara comparison 支持：

- screen、theme、size 过滤；
- Web authority / Lynx-for-Web / Native 三列；
- retained / diagnostic / pending / missing 状态；
- notes、metrics 链接；
- lightbox、左右键、Esc；
- summary counts 与明确图例；
- 离线、仓库相对路径。

T3 comparison 必须达到同等级别，不能继续把 capture 脚本尾部的 70 行 HTML 当最终交付。

### 5. 视觉 gap 必须 measure → classify → owner

Synara 不把一个“总体分数”当完成度，而是记录：

- geometry anchors；
- typography metrics；
- resolved material colors / borders / radius / shadows；
- icon painted bounds；
- content/order/count；
- interaction state；
- console 与 runtime identity。

每个 residual 有 taxonomy、severity、owner、fix strategy 和 disposition。P0/P1 不能被总体
分数或大量绿色 cells 掩盖。

### 6. Physical reuse 从 route graph 计算

Synara 从 Web route entry 构建静态模块图，固定分类：

- `SHARED`: Web / Lynx 构建同一个物理源文件；
- `PATCHED`: 同一真源经确定性生成；
- `SPLIT`: 同一无后缀 import / props contract，下层平台双实现；
- `EXCLUSIVE`: 明确 hard island。

同时报告 module reuse 与 LOC reuse；未分类模块是 audit failure。复用率是架构和优先级
信号，不能单独认证视觉。

### 7. Context 通过 roadmap、LOG、completion audit 收口

Synara 的每个 coherent slice 都会：

1. 更新 roadmap 状态；
2. 在 LOG 记录尝试、失败、结论和下一步；
3. 用 strict manifest 表达尚未完成的 required cells；
4. 最终 completion audit 把 prompt requirement 映射到 artifact / code / test / evidence；
5. 明确保留历史，但只有当前 roadmap 和 manifest 是 execution authority。

## Authority reset

Plan 11C 执行后，以下 authority 顺序固定：

1. `AGENTS.md`
2. `apps/lynxtron/docs/plans/00-execution-index.md`
3. 本文件
4. `apps/lynxtron/docs/harness/current-state.md`（H0 生成）
5. 当前 strict evidence manifests 与 verifier output
6. `apps/lynxtron/docs/gap-atlas.md`（H6 生成）
7. `apps/lynxtron/docs/next-port-priorities.md`（H7 生成）
8. `implementation-status.md` / `port-ledger.md` 只作为被整理后的历史与实现记录

### Superseded execution context

- Plan 11A / 11B 保留为历史设计记录，不再作为 Harness 执行说明。
- `BW*` / `SB*` 旧目录在 H1 分类前不得用于 visual certification。
- 旧 comparison 中的 `PASS` 只可解释为历史脚本结果，不能继承为 visual status。
- 旧 geometry baseline 不能直接作为新 manifest 的 expected baseline。
- 旧 reference-host、static scenario 或 iframe-specific 结论必须重新在真实 clients 上验证。

## Gate model

每个 matrix cell 有五个独立 gate，禁止合并成一个含糊 `PASS`：

1. **Harness validity**
   - process / bundle / snapshot / route / state / viewport / dimensions / console / cleanup 有效。
2. **Content identity**
   - labels、order、counts、selected project/thread/model、lifecycle state 一致。
3. **Visual fidelity**
   - geometry、typography、material、icons、major composition residual 已关闭或登记。
4. **Interaction fidelity**
   - 本 cell 声称的真实 control path、focus、open/close、mutation 或 scroll 已验证。
5. **Source reuse**
   - route / product-surface graph 的 SHARED / PATCHED / SPLIT / EXCLUSIVE 分类可解释。

建议状态：

- `invalid-harness`
- `capture-valid`
- `visual-gap`
- `interaction-gap`
- `intentional-delta`
- `visual-certified`
- `native-certified`

只有满足对应 gate 时才能使用 `visual-certified` / `native-certified`。

## Residual taxonomy

每个 gap 必须属于一种：

- `CONTENT`
- `GEOMETRY`
- `TYPOGRAPHY`
- `MATERIAL`
- `ICON`
- `MOTION`
- `INTERACTION`
- `STATE_SELECTION`
- `ENGINE_CORRECTION`
- `RUNTIME_CAPABILITY`
- `SOURCE_REUSE`
- `INTENTIONAL_PLATFORM_DELTA`
- `HARNESS_INVALID`
- `ANTIALIASING_NOISE`

Severity：

- `P0`: 主结构、主要 surface、route/state 错误，第一眼破坏产品身份；
- `P1`: 高频 control、overlay、typography、selection 或 interaction 明显错误；
- `P2`: 可见但不主导整体体验的 optical / motion / density 差异；
- `P3`: 小范围 raster 或低频平台差异。

任何 P0/P1 不得因总体相似或其他 cells 绿色而关闭。

## Initial product-state matrix

H4 首个 strict manifest 至少覆盖：

| Surface | Required states |
| --- | --- |
| Main shell / New Thread | hero、project selected、no project、connection ready/error/reconnecting |
| Existing Thread | idle、working、completed、failed、approval、question/input |
| Sidebar V2 | normal、project scope open、selected thread、working/unread/status rows |
| Composer | hero/docked、disabled、sendable、working/stop、model picker、runtime/interaction modes |
| Quick Switch | default、query、actions-only、empty |
| Model Picker | default、provider rail、query、empty、selected model |
| Settings | General、Appearance、Providers、Connections、Source Control、Beta、Archive |
| Review / Changed Files | checkpoint、changed-files tree、diff fallback 或 registered hard island |

Fast loop 默认先做 dark + 1280×820；phase-exit 扩到 light/dark × 1280/1440。Native 只覆盖
该阶段要求的 platform-final states，不机械复制全部 Browser cells。

## Task sequence

| ID | Task | Depends on | Status | Exit result |
| --- | --- | --- | --- | --- |
| H0 | 冻结 worktree 与 authority baseline | current worktree | `completed` | 所有 dirty files、processes、evidence 和 docs 有 provenance inventory |
| H1 | 清理执行上下文与证据分类 | H0 | `completed` | 一个 current-state authority；旧计划/证据被分类，不再互相覆盖 |
| H2 | 建立 strict evidence schema 与 verifier | H1 | `completed` | manifest 成为唯一证据 SSOT，invalid/incomplete cells 会失败 |
| H3 | 重建可证明的 shared-server Fast Harness | H2 | `completed` | 真实 Web / Lynx-for-Web 同 snapshot/state，可重复 capture |
| H4 | 建立 Synara 级 comparison archive | H2, H3 | `completed` | screen/theme/size/client gallery、status、notes、metrics、lightbox 可用 |
| H5 | 建立 source reuse 与 style coverage audit | H1 | `completed` | route graph physical reuse 与 class/token coverage 可重复生成 |
| H6 | 生成三端 residual atlas | H3, H4, H5 | `completed` | 主要产品状态 gap 有 taxonomy、severity、owner、evidence |
| H7 | 冻结下一阶段 port priorities | H6 | `completed` | Top 10 parent gaps 按 final residual score 冻结；bounded slices 只记录 progress |
| H8 | Context cleanup 与 handoff | H7 | `completed` | completion audit、8-file handoff 与安全 cleanup 已落盘 |

Use only `pending`, `in_progress`, `completed`, `blocked(runtime-gap-id)`, or
`skipped(reason)`. Only one H task may be `in_progress`.

## H0 — 冻结 worktree 与 authority baseline

### Required work

1. 读取并记录：
   - `git status --short`
   - `git diff --stat`
   - `git diff --name-only`
   - 当前 branch / HEAD / merge-base / remote relation
2. 将 dirty files 按 provenance 分组：
   - Plan 10/11 product work；
   - Plan 11A/11B Harness work；
   - generated reports；
   - evidence artifacts；
   - unrelated user work；
   - build caches / accidental artifacts。
3. 记录 owned/user processes、ports、state directories。
4. 生成 `apps/lynxtron/docs/harness/worktree-inventory.md`。
5. 不 reset、不删除、不覆盖任何未分类文件。

### Exit criteria

- 每个 dirty path 有 owner/provenance/disposition。
- Android `.gradle`、temporary captures、diagnostic scripts 等明确标为 generated、
  diagnostic、user-owned 或 accidental。
- H1 可在不丢失用户工作的前提下处理上下文。

## H1 — 清理执行上下文与证据分类

### Required work

1. 创建 `apps/lynxtron/docs/harness/current-state.md`，只陈述当前可验证事实。
2. 创建 context registry：

   | Artifact | Classification | Authority | Disposition |
   | --- | --- | --- | --- |
   | Plan 11A | historical design | no | retain, mark superseded |
   | Plan 11B | historical correction | no | retain, mark superseded |
   | BW2/BW3/BW4 | diagnostic/reference-host history | no | archive classification |
   | SB4b/c/d/final | interrupted diagnostics | no | exclude from manifests |
   | current strict manifests | execution authority | yes | retain |

3. 更新 `00-execution-index.md`：
   - Plan 11C 是当前 Harness / gap-priority authority；
   - 11A/11B 只读历史；
   - 下一阶段 port 不可绕过 H7。
4. 修订或标记：
   - `implementation-status.md`
   - `port-ledger.md`
   - `dual-renderer-gap-log.md`
   - `visual-capture.md`
5. 删除只在完全确认可重现、无引用、非用户工作时进行；否则保留并在 registry 中降级。

### Exit criteria

- 新 session 不会再从 reference host、旧 `PASS` 或旧 geometry baseline 开始。
- 一个文档回答“当前 Harness 能证明什么、不能证明什么、下一步是什么”。
- 旧证据仍可追溯，但不会进入 strict manifests。

## H2 — Strict evidence schema 与 verifier

### Deliverables

- `apps/lynxtron/evidence/manifests/schema.ts` 或 JSON Schema；
- `apps/lynxtron/evidence/manifests/<slice>.json`；
- `apps/lynxtron/scripts/verify-evidence-manifest.mjs`；
- focused verifier tests。

### Required manifest fields

- manifest version / slice id / label / notes；
- defaults:
  - semantic route
  - theme
  - viewport / DPR
  - density
  - snapshot hash
  - selected project/thread/model
- per state:
  - state id / label
  - exact interaction state
  - required / optional clients
- per client:
  - status
  - path
  - capture tier
  - build/bundle hash
  - snapshot hash
  - PNG dimensions
  - assertions
  - console
  - state echo
  - missing/diagnostic reason。

### Verifier rules

- required client 非 `retained` 时 strict mode 失败；
- `diagnostic/pending/not-applicable` 必须有 reason；
- PNG dimensions 必须与 cell contract 一致；
- snapshot / route / selected state mismatch 失败；
- retained evidence 必须有 console 与 assertions；
- Browser evidence 不可满足 Native-only requirement；
- `capture-valid` 不自动升级为 `visual-certified`；
- 同一 screenshot 不可复用为两个互斥 interaction states；
- comparison HTML 不允许手写 cases，必须由 manifest 生成。

## H3 — Shared-server Fast Harness

### Architecture

```text
one isolated T3 server + one canonical snapshot
  |-- real Web app ------> named isolated browser session
  `-- Lynx-for-Web ------> dev-only host transport
```

### Preflight

- dry-run ports；
- record state dir / server PID / Web PID / browser session；
- create missing product state through real RPC/API, not renderer hardcoding；
- verify both clients:
  - same snapshot hash
  - same project/thread/model
  - same semantic route
  - same theme/density
  - exact viewport/DPR
  - clean fresh console
- verify PNG dimensions after capture。

### Fast-loop rules

- default cell: dark, 1280×820, DPR 1；
- named isolated browser sessions；
- Web authority 是 visual/composition authority，不是 bug oracle；
- 真实 control path 设置 route、overlay、selection 和 mutations；
- programmatic setup 只能用于不可见 fixture preparation，并必须记录；
- capture 后保存 assertions、metrics、console；
- iteration slice 完成时才跑 production build，不在每个 margin edit 后全量 build。

### Invalid evidence conditions

- 两端 selected thread/model 不同；
- route/theme/state 不同；
- exported dimensions 错；
- server/snapshot identity 不同；
- stale bundle；
- unowned process；
- runtime errors；
- state 被外部 writer 改动。

## H4 — Synara 级 comparison archive

### Requirements

1. 由 manifest 生成，支持离线打开。
2. 顶部 summary：
   - screen/state count
   - theme × size combinations
   - Browser / Native retained counts
   - incomplete required cells
   - P0/P1 residual count
3. Filters：
   - surface/screen
   - state
   - theme
   - size
   - client
   - evidence status
   - residual severity/category
4. 每个 case：
   - Web / Lynx Web / Native 三列；
   - retained/diagnostic/pending/missing status；
   - frame dimensions；
   - build/snapshot identity；
   - notes / metrics / assertions / console links；
   - residual badges。
5. Interaction：
   - lightbox
   - left/right
   - Esc
   - zoom
   - deep-linkable filters/case ids
6. 比较工具：
   - side-by-side
   - alpha overlay
   - split view
   - pixel diff
   - edge diff
   - 自动分数只排序，不决定 pass。
7. 中文为默认审阅语言。

### Exit criteria

- 至少一个 strict slice 完整生成。
- required missing cells 明确红色，不允许页面整体 `PASS`。
- 页面质量与
  `/Users/bytedance/github/synara/shots/2026-08-03/p8-q2/comparison.html`
  同等级，而不是 capture 脚本附带 debug HTML。

## H5 — Source reuse 与 style coverage audit

### Route graph audit

对 initial product-state matrix 的 Web route entries：

1. 用 TypeScript AST 解析静态 import graph；
2. 用实际 Lynx resolver 顺序解析 Lynx graph；
3. 对模块固定分类：
   - SHARED
   - PATCHED
   - SPLIT
   - EXCLUSIVE
   - UNMAPPED（current failure）
4. 报告 modules 与 non-empty logical LOC；
5. 记录 unresolved / external imports；
6. 分类规则 source controlled，不可为提高数字临时扩大 exclusions。

### Three scopes

- route graph
- product-surface graph
- renderer-local graph

### Style coverage

- 从 eligible module graph 提取 class tokens；
- 统计 occurrence weight；
- 分类：
  - GENERATED
  - PATCHED
  - UNSUPPORTED
  - UNMAPPED
  - CUSTOM
- 每个未覆盖 token 链接到 file/screen provenance；
- 高权重 token 优先于长尾数量；
- style coverage 是 risk map，不是 visual certification。

## H6 — Residual atlas

### Deliverables

- `apps/lynxtron/docs/gap-atlas.md`
- machine-readable `apps/lynxtron/reports/gap-atlas.json`
- 每个 screen/state 的 `notes.md` 与 metrics。

### Gap fields

- id
- surface/state
- clients
- category
- severity
- user impact
- recurrence/frequency
- evidence confidence
- source owner
- likely root cause
- fix class:
  - shared composition
  - shared token
  - platform primitive
  - host adapter
  - engine correction
  - runtime capability
  - harness
- reuse leverage
- implementation risk
- Native requirement
- disposition
- evidence links。

### Measurement target

普通高频 UI：

- core anchor position/size target ≤2px；
- repeated row rhythm cumulative drift ≤2px；
- icon/text baseline target ≤1px；
- popup/trigger alignment ≤2px；
- typography 记录 resolved family、size、weight、line-height、letter-spacing、text box；
- material 记录 resolved RGBA、border、radius、shadow；
- content/order/count exact；
- P0/P1 必须人工审阅。

旧 ≤8px 只保留为 coarse gate，不能代表 perceptual pass。

## H7 — 下一阶段 port priority roadmap

不得按文件大小、历史计划编号或“实现起来容易”排序。每个 gap 计算：

- User frequency: 0–5
- Severity: P0=5, P1=4, P2=2, P3=1
- Product trust impact: 0–5
- Reuse leverage: 0–5
- Cross-surface leverage: 0–5
- Evidence confidence: 0–3
- Implementation cost: 1–5
- Platform risk: 0–5

建议排序信号：

```text
priority =
  severity * 4 +
  frequency * 3 +
  trustImpact * 3 +
  reuseLeverage * 2 +
  crossSurfaceLeverage * 2 +
  evidenceConfidence -
  implementationCost -
  platformRisk
```

公式只帮助排序，P0/P1 和 Native safety boundary 可人工上调。

### Priority bands

- `Now`: P0/P1，高频、shared-owner leverage 高、证据明确；
- `Next`: P1/P2，需要一个 bounded primitive / adapter；
- `Later`: 低频 optical 差异或需 Native batch；
- `Hard island`: runtime capability，不混入普通 UI backlog；
- `Harness first`: evidence 无效时先修 Harness。

### Output

`apps/lynxtron/docs/next-port-priorities.md` 至少包含：

- Top 10 gaps；
- 推荐 slice boundary；
- shared owner / platform leaf；
- required Browser states；
- required Native states；
- focused tests；
- success criteria；
- dependency / risk；
- 明确不做项。

该文件成为 Plan 12 或其替代计划的输入，不能直接把旧 Plan 12 顺序当结论。

## H8 — Context cleanup 与 handoff

### Required work

1. 更新：
   - `00-execution-index.md`
   - `implementation-status.md`
   - `port-ledger.md`
   - `compat-matrix.md`
   - `visual-capture.md`
2. 11A/11B 顶部加明确 historical/superseded banner，不再在正文交叉追加补丁说明。
3. 将旧 evidence 按 manifest registry 分类：
   - retained
   - diagnostic
   - invalid-harness
   - superseded
   - generated/reproducible
4. 删除 only-if-safe：
   - 无引用、可重建的中间 diff；
   - 中断 capture；
   - accidental build caches；
   - 临时诊断脚本。
5. 保留 raw history，但当前 comparison 只消费 strict manifests。
6. 生成 completion audit：
   - requirement → artifact/code/test/evidence；
   - incomplete cells；
   - open P0/P1；
   - next priority slice；
   - cleanup/state restoration。

### Exit criteria

- 新 session 的必读清单不超过 8 个文件。
- 没有两个 plan 同时声称 Harness authority。
- 没有旧 `PASS` 被解释为 visual certification。
- 下一 goal 可以从 priority #1 直接执行，不需重新调查历史。

## Per-task verification

优先运行最小验证：

- manifest verifier focused tests；
- Harness preflight；
- one 1280×820 Browser pair；
- route graph reuse audit；
- style coverage audit；
- comparison offline-open check；
- `git diff --check`。

只有在 H6/H8 或明确 phase exit 才运行：

- complete Browser matrix；
- Native batch；
- broad builds/typechecks；
- full cleanup audit。

遵守仓库规则，不运行 repo-wide checks，除非用户明确要求。

## Stop conditions

Stop and report when：

- dirty worktree provenance 无法确定，删除/移动可能覆盖用户工作；
- 真实 Web / Lynx 无法使用同 server/snapshot/state；
- evidence schema 需要 product hardcoding 才能通过；
- Native client identity 无法由 owned PID 证明；
- stack-wide Lynx upgrade 成为前置条件；
- comparison 只能靠扩大 masks 或降低 gate 才显得绿色；
- route graph audit 需要把困难模块排除才能达到目标；
- 外部 writer 修改 isolated state，无法安全恢复。

## Success criteria

Plan 11C 只有全部满足才完成：

1. 一个 current-state authority 已取代 11A/11B 的执行上下文；
2. strict manifest + verifier 可表达 incomplete/invalid/diagnostic evidence；
3. Fast Harness 在同 server/snapshot/state 下稳定重放至少一个高频 slice；
4. comparison archive 达到 Synara p8-q2 的审阅能力；
5. physical source reuse 与 style coverage 可重复审计；
6. initial matrix 的真实 residual atlas 已生成；
7. 下一阶段 Top 10 priority roadmap 已冻结；
8. 旧证据与计划已分类，不再误导新 session；
9. completion audit 和 exact next task 已落盘；
10. owned processes/ports/state 已清理。

## Replacement goal prompt

```text
在 `/Users/bytedance/github/t3code` 的 `lynxtron-port` 分支执行：

`apps/lynxtron/docs/plans/11c-synara-harness-reset-and-gap-prioritization.md`

目标不是继续盲目添加 UI，也不是把旧 comparison 美化一下，而是学习
`/Users/bytedance/github/synara` 已验证的 Harness、UI fidelity 和 monorepo reuse 经验：

1. 先冻结 dirty worktree provenance，保护所有用户工作；
2. 清理 Plan 11A/11B、旧 PASS、旧 evidence 和 status/ledger 的冲突上下文；
3. 建立 manifest-first strict evidence schema 与 verifier；
4. 用一个 isolated server、一个 canonical snapshot、真实 Web 与 Lynx-for-Web 重建 Fast Harness；
5. 建立 Synara p8-q2 同等级的 Web/Lynx/Native comparison archive；
6. 建立 route-graph physical source reuse 和 weighted style coverage audit；
7. 对主要产品状态生成 residual atlas，按 taxonomy、severity、owner、reuse leverage 分类；
8. 用真实 gap 冻结下一阶段 Top 10 port priorities；
9. 更新执行索引、current-state、implementation-status、port-ledger、compat matrix 和 handoff；
10. 只有 strict manifest、comparison、gap atlas、priority roadmap 和 context cleanup 全部完成才停止。

必须读取：
1. `AGENTS.md`
2. `apps/lynxtron/docs/plans/00-execution-index.md`
3. `apps/lynxtron/docs/plans/11c-synara-harness-reset-and-gap-prioritization.md`
4. `apps/lynxtron/docs/implementation-status.md`
5. `apps/lynxtron/docs/port-ledger.md`
6. `/Users/bytedance/github/synara/AGENTS.md`
7. `/Users/bytedance/github/synara/apps/lynx/plan/05-side-by-side.md`
8. `/Users/bytedance/github/synara/apps/lynx/plan/06-high-fidelity-port.md`

关键规则：
- checkout on disk authoritative；
- 不 reset/delete 未分类 dirty work；
- 旧 BW/SB PASS 不是 visual certification；
- Web/Lynx 必须同 server/snapshot/selected state；
- Browser pass 不冒充 Native pass；
- comparison 由 manifest 生成，不手写 cases；
- capture-valid、visual-certified、native-certified 分开；
- 不复制 Web JSX，不扩大 exclusions/masks，不直接写 renderer fixture 伪造状态；
- 不在明确授权前 commit/push/PR；
- repo-wide checks 只在明确要求时运行。

先执行 H0。保持一次只有一个 H task 为 in_progress。
```
