# Lynxtron 移植进展评估(2026-07-29)

> 评估对象:`lynxtron-port` 分支(commit `f8fd18452 "feat: port Lynxtron into monorepo"`,
> 411 文件 / +38k 行),对照 `.plans/lynxtron-port-strategy.md` 的目标逐项核实。
> 所有结论都附验证方式,可重跑。

---

## 1. 现状快照(已核实的事实)

| 里程碑 | 状态 | 证据 |
|---|---|---|
| M0 地基 | ✅ 完成 | `apps/lynxtron` 骨架、`.lynx/.web` 扩展名解析、typecheck/test 脚本、`scripts/audit-web-apis.mjs` + `audit-css.mjs`、`docs/compat-matrix.md`(R1–R11)、`docs/port-ledger.md` 均存在 |
| M1 数据层 | ✅ 完成 | **P0 探针成功**:Effect Atom 已是 Lynx 渲染层实时状态基座,`useT3Connection` 单例退役;connector 迁入并升级为 typed Effect RPC(702→943 行);真实 server 全链路(auth/订阅/建 thread/发 prompt/打断)跑通 |
| M2 CSS 管线 | ◑ 变体落地 | `generate:css` + token 从 web `index.css` 确定性复制 + coverage 审计存在;**偏离** §4.3 单一 Tailwind 源:Lynx 走 Tailwind v3 + `@lynx-js/tailwind-preset`,web 保持 v4(决策见 `docs/port-ledger.md`) |
| M3+ 组件 | ◑ 进行中 | Settings General 整路由已四门认证(70.1% 行级共享、最大锚点偏差 3.95px、颜色精确、零渲染错误);T6-C1(shell/header/sidebar)活跃;apps/web 内 61 个 `.lynx.*` 平台分裂文件;~20 个共享 presentation 模块提取进 `client-runtime` |

- 全局复用率(严格产品图谱):**27.8% 模块 / 36.4% 行**(策略目标整体 ≥60%);
  最新 Sidebar V2 slice 的复用率增量 **<1 个百分点**。
- 评估时 `pnpm run typecheck`(apps/lynxtron)**红,233 个 TS 错误**,集中在 web 侧
  `.lynx` 文件(可能是并行会话中间态,但无机制保证绿 tip)。

## 2. 做得好的(应保持)

1. **P0 风险全部按计划退役**:effect-atom × ReactLynx 探针成功,连带解决 QuickJS
   Encoding globals、`replaceAll`/`toSorted` 等 ES 兼容细节。架构押注已兑现。
2. **诚实指标文化**:`reuse-report.mjs` 基于真实 Rspeedy 生产 resolver + boundary
   hash;执行索引明确"不许把语义共享报成视觉 parity、不许把截图匹配报成源码复用"。
   这是旧仓("视觉近似无台账")问题的彻底解药,必须延续。
3. **认证方法论闭环**:Settings General 走完四门(样式生成/视觉/内容状态/交互),
   双视口、八状态、CDP+DevTool 双端截图。流水线端到端可行。
4. **兼容矩阵是活的**:执行中新发现的 R10(diff 渲染)、R11(异步 bundle URL)被
   登记而非被 workaround 掩盖;每条有 adapter owner 和 remove-when。
5. **真交互测试抓到真 bug**:Sidebar 菜单三行塌陷导致 Rename 实际触发 Delete,
   靠 DevTool 交互 pass 发现,而非截图对比。

## 3. 严重问题(进展缓慢的根因)

### P1 — runtime gap 已成为复用率收敛的关键路径
每接入一块真实 Web 组合就撞新 gap:Sidebar V2 直接编译 2,735 行 Web 组件触发
Effect 主线程 `onItem` 崩溃;lazy 加载撞 R11;最终退回有界宿主方案。共享越多撞墙
越频繁。**R1–R11 至今没有一条以 issue 形式提给 Lynx/Lynxtron 团队**——策略 §3.2
"推动演进"的闭环只做了登记这一半。runtime 修复 lead time 长,不并行推进,
复用率会长期压在 40% 以下。

### P2 — 工程卫生债,38k 行工作高风险
- 分支**只存在于本地 worktree**(`~/.codex/worktrees/f409/t3code`),`origin` 指向
  `pingdotgg/t3code`,无 fork remote → 推不上去、无 CI、无备份;
- 全部工作是**一个巨型 squash commit**,策略要求的"每组件一个 PR"未执行;
- `apps/lynxtron/evidence/` 与 `reports/` untracked——认证证据链在版本控制之外;
- 当前 tip typecheck 红(233 errors),"绿 tip"仅是文档声明,无 CI 强制。

### P3 — upstream 合并债每天变贵
分支基线为 7/24 upstream;对 web 既有文件的修改面 **63 文件 / +1423 −2915 行**,
其中 `Sidebar.tsx`(415 行)、`SidebarV2.tsx`(587 行)恰是 upstream 当前最活跃
区域。策略 §6 的周合并节奏未启动;client-runtime 提取(可回捐改动)一个 PR 都
没提——拖得越久冲突越大。

### P4 — 认证成本曲线过陡
四门认证对 phase exit 是对的,但对每个中间 slice 过重(八状态双视口证据),
单位复用率增量的成本在上升。

### P5 — 文档源分裂
策略文档存在三处(`t3code-lynxtron/docs/PORTING_STRATEGY.md` untracked、
本文件旁的 `lynxtron-port-strategy.md`、旧仓 `docs/PORT_WORKFLOW.md`);工作在
隐蔽 worktree 中,协作者(人或 agent)定位成本高。

## 4. 建议(按优先级)

1. **保护资产(当天)**:建 fork remote 并 push `lynxtron-port`;`evidence/` 纳入
   版本控制或归档;挂最小 CI(typecheck + focused tests + 双端 build + audits),
   绿 tip 成为合并规则。
2. **本周 merge 一次 upstream main**,趁冲突面可控;恢复周节奏;client-runtime
   提取拆小 PR 开始回捐。
3. **给 Lynx/Lynxtron 团队正式提 R1–R11 issue**(文档已有最小复现)。R11 与 R5
   直接阻塞 T6/T7;R3 影响流式体验。
4. **认证分层**:slice 级只跑 typecheck + scanner + 单视口零错误 capture;完整
   八状态双视口认证留给 phase exit(T6/T7/T8)。
5. **收敛文档源**:旧仓声明 reference-only 并删除 untracked 策略副本;计划以
   `.plans/` + `apps/lynxtron/docs/` 为准。

## 5. 验证命令(复核本评估用)

```bash
# 分支与 worktree
git -C ~/github/t3code worktree list
git -C ~/.codex/worktrees/f409/t3code log --oneline -3

# 复用率与审计
cd ~/.codex/worktrees/f409/t3code/apps/lynxtron
pnpm run report:reuse && pnpm run audit

# 绿 tip 检查
pnpm run typecheck

# web 侧侵入面
git -C ~/.codex/worktrees/f409/t3code show HEAD --diff-filter=M --numstat -- apps/web packages \
  | awk 'NF==3 {a+=$1; d+=$2} END {print "+"a" -"d}'
```

---

*评估人:Claude(Fable 5),基于对分支 HEAD `f8fd18452` 的直接核查;
自述文档(`apps/lynxtron/docs/implementation-status.md`)的复用率与认证声明
与实测一致,唯 typecheck 绿的声明与评估时点的实测不符。*
