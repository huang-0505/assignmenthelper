# Offer Quest · 上岸闯关

为一位准备 Data Scientist 面试的玩家和一位裁判打造的中文每日训练营。Next.js App Router + TypeScript + Tailwind CSS，Supabase Postgres，适配 Vercel Hobby。没有账号和密码：玩家输入名字进入，裁判用专属链接进入。

## 先在本机体验

要求 Node.js 22 或更新版本，推荐 Node.js 24 LTS。

```bash
cd /Users/huang/Desktop/offer-quest
npm install
npm run dev
```

打开 <http://localhost:3000>。开发环境未配置 Supabase 时自动进入演示模式：

- 预置六天训练记录、两个示例项目、今天部分进度。
- 演示状态保存在当前浏览器的 `localStorage`，刷新不会丢失；不同浏览器不共享。
- 页面顶部可切换玩家 / 裁判。正式模式下，角色由进入方式决定：首页输入名字是玩家，专属链接是裁判。
- 演示不调用 AI；提交答案后切换裁判，在工作台打开今天、填写评语并给出 3 分以上，即可体验通过及第七天里程碑。
- 面试和 BQ 草稿会自动保存在本机；点击保存 / 提交才写入训练记录。
- 要清除演示数据，可在浏览器站点数据设置中清除此本地站点的数据。

生产模式未配置数据库时会提示配置错误，不会自动变成演示站。要预览生产构建的演示版：

```bash
npm run build
DEMO_MODE=true npm start
```

## 配置 Supabase

1. 创建 Supabase 免费项目。
2. 在 SQL Editor 按顺序执行：
   - `supabase/migrations/001_initial.sql`（仅首次建库执行）。
   - `supabase/seed.sql`（可重复执行，按题目 ID 更新）。
3. 复制环境变量示例。如果已有 `.env.local`，编辑它，不要覆盖：

```bash
cp -n .env.example .env.local
```

填写：

| 变量                        | 来源 / 用途                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`  | Supabase 项目的 Project URL（只在服务端使用）                                       |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key 或 secret key，只能保存在服务端                           |
| `REFEREE_KEY`               | 随机长字符串：裁判专属链接的密钥，同时用于签名会话 cookie                           |
| `LLM_BASE_URL`              | 默认 `https://openrouter.ai/api/v1`；其他 OpenAI-compatible 服务填写其 API base URL |
| `LLM_API_KEY`               | 对应服务商的 API key，只在服务器使用；留空时全部转裁判审核                          |
| `LLM_MODELS`                | 按优先级排列、用逗号分隔的模型 ID；默认全部为 OpenRouter `:free` 模型               |
| `APP_URL`                   | 本地可留空（自动使用请求的 origin）；上线后必须设为最终 HTTPS 域名                  |
| `CRON_SECRET`               | 随机长字符串，用于验证 Vercel cron 请求                                             |
| `DEMO_MODE`                 | 正式使用设为 `false`；明确设为 `true` 可展示独立本机演示                            |

可以用以下命令分别生成 `CRON_SECRET` 和 `REFEREE_KEY`，在自己的终端里复制到环境变量。不要提交 `.env.local`。

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

4. 重启开发服务器，按下文「进入方式」进入。第一次进入时建立训练营，从当天开始，不预填真实记录。

## 进入方式

没有账号和密码：

- **玩家**打开首页，输入自己的名字即可进入。第一次输入的名字会成为玩家名字；之后换设备时输入同一个名字（不区分大小写）即可，其他名字会被拒绝。
- **裁判**打开专属链接 `https://你的域名/referee#key=<REFEREE_KEY>`，确认名字后进入裁判工作台。密钥放在 `#` 之后，不会发到服务器或出现在请求日志里；页面读取后立即从地址栏移除。
- 进入后，服务器写入一个用 `REFEREE_KEY` 签名的 HttpOnly cookie，有效期 180 天，同一设备不用再次输入。
- 裁判可以在「挑战设置」里修改玩家名字：可以在玩家第一次进入前预先设好，也可以修正输错或被他人占用的名字。改名后，旧名字的会话立即失效。
- 更换 `REFEREE_KEY` 会让所有人的会话和旧的裁判链接同时失效。

名字只是一道轻量门槛，任何知道玩家名字的人都能以玩家身份进入；裁判权限只认密钥。请只把网址告诉玩家本人，把裁判链接留给自己。

## 部署到 Vercel 免费版

1. 将此目录作为独立 Git 仓库推送到你的 GitHub，导入 Vercel；也可以在此目录运行 `npx vercel login` 和 `npx vercel`。
2. Framework 选择 Next.js，Root Directory 为项目根目录，Node.js 选择 24.x。Build Command 使用 `npm run build`，Install Command 使用 `npm ci`。
3. 在 Vercel Project → Settings → Environment Variables 中添加上述变量。`APP_URL` 必须对应这次部署实际访问的域名。Production 和 Preview 分开配置；预览环境可明确使用 `DEMO_MODE=true`，避免连接真实数据。
4. 为正式环境设置 `DEMO_MODE=false`。`SUPABASE_SERVICE_ROLE_KEY`、`REFEREE_KEY`、`LLM_API_KEY`、`CRON_SECRET` 都不能带 `NEXT_PUBLIC_` 前缀。
5. 更新变量后重新部署。玩家在首页输入名字、裁判打开专属链接，分别验证记录、人工审核和刷新后的数据持久化。
6. Vercel 会读取 `vercel.json`，每天 UTC 10:00 调用 `/api/cron`。配置 `CRON_SECRET` 后，Vercel 自动附带对应 Bearer header。`vercel.json` 同时把框架固定为 Next.js，即使项目创建时被识别成 "Other" 也能正常部署。

Hobby cron 每天只能执行一次，且不保证精确到分钟。因此，**截止时间由服务器判断，cron 只是补结算兜底**；打开应用、刷新、提交动作、后台每分钟刷新都会按实际截止时间补齐日期。即使 cron 延迟，也无法补填已关闭日期。文档：[Vercel Cron 使用限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)。

所有服务端操作限制在单个双人训练营内，不依赖长驻进程或本地文件存储，适合 Vercel 无服务器函数。LLM 最多尝试 4 个模型，每个超时 8 秒，路由最长执行时间 60 秒。

## 每日规则

- 默认纽约当地午夜结束；裁判可修改为 0–23 点的任一整点。Temporal 处理纽约夏令时，一天可能为 23 或 25 小时。
- 默认最低目标：3 份申请 **且** 20 位联系人 **且** 一道面试题最终分数 ≥ 3 **且** 当天 BQ 阶段完成。
- 默认基础积分 100；申请达到 5 份、联系达到 30 人，各额外 25 分。只有当天整体达标时才发基础分和加分，每项每天最多计一次。
- 默认出题：周一 ML、周二 AI/LLM、周三 SQL、周四 ML、周五项目深挖、周六 SQL / Python 隔周轮换、周日 AI/LLM。轮换以 2026-01-05 所在周为 SQL 周，后续每周翻转。
- 同类别题目全部分配一遍前不重复。漏做也算已分配；下一轮优先安排失败 / 未通过且间隔至少七天的题目。当天题目固定，刷新不会换题。
- 12 道 BQ 按固定顺序，每题先写至少 40 字符的 STAR 草稿，再在后续日期勾选已大声练习。一天只有一个阶段；错过的阶段保持待完成。所有 24 阶段完成后的下一天不再要求 BQ。
- BQ 全部毕业后，每个纽约训练周可以任选一个已完成故事口述复习，额外获得一次加分。无需再次做满 BQ。
- 项目页支持录入和编辑最多 3 个项目，建议先准备 2–3 个。项目日按项目轮转，从方法选择、个人贡献、指标验证、失败诊断和反思中生成具体追问；生成使用可复现的本地模板，嵌入玩家的真实项目内容，不消耗 LLM 额度。已生成题目保留快照，不因编辑项目而改变。
- 初始训练周自动获得 1 张冻结卡；之后每个新训练周补 1 张，上限 2 张。漏打卡日自动消耗一张，保留连胜但不增加连胜天数、不给积分。
- 无卡的漏打卡日连胜归零，默认罚金池加 $10；达到 $50 显示「请裁判吃饭」。裁判确认后兑换当前全部余额，并保留记录。应用只记录约定金额，不处理实际付款。
- 默认首次达到 7 / 14 / 21 天成功连胜解锁对应奖励。正常打卡只有任务状态反馈；里程碑才出现全屏庆祝。庆祝已读状态保存在当前浏览器。
- 设置变更从下一个训练日生效，每一天保存独立规则快照。修改结算时刻可能造成下一天的过渡时段缩短或延长；已有截止时刻和历史最低要求不变。

## 评分与人工审核

服务端向 `/chat/completions` 提交题目、rubric 和答案。评分 JSON 必须满足 1–5 整数、最多六个缺失要点和一条改进建议，字段全部经过 Zod 验证。429、其他非成功状态、超时和无效 JSON 都会尝试下一个模型。默认模型来自 OpenRouter 免费列表，供应可能变化，可更新 `LLM_MODELS`；[当前免费模型](https://openrouter.ai/collections/free-models)。

提交答案会先保存为 pending，再调用模型。服务中断或全部失败时答案不会丢失，裁判可以通过 / 拒绝并填写理由。每一天最多提交五次；pending 状态下先完成裁判审核，再允许提交新版本。当前最低要求使用**最近一次答案**的最终评分。

裁判可以覆盖任意一次 AI 评分，原 AI 反馈和裁判记录都保留；晚到的 AI 结果不会覆盖裁判决定。改分后从训练开始日期重算连胜、冻结卡、积分与罚金。若关闭日只差人工审核便可达标，该日及之后的累计结算暂缓，避免先扣罚再修正；其他任务也没做完则仍按未达标结算。兑换罚金前须处理会影响结算的待审日期。

已兑换金额永久保留。若改分使历史罚金减少，余额按 `max(0, 累计应罚 - 已兑换)` 计算，不产生负余额；撤回通过会同步撤回对应积分或奖励资格。题目和作答历史不会被改分删除。

参考 SQL 只作为文本评分依据。应用从不执行玩家提交的 SQL 或 Python。项目、题目和答案作为不可信数据传给评分模型；授权、评分范围、可提交日期和所有状态更新由服务器验证。

## 数据与代码结构

```text
src/app/[[...view]]/page.tsx    今日、日历、成长、项目、裁判、设置
src/app/api/                  进入 / 退出、状态读取、动作、cron 路由
src/components/               响应式界面和交互
src/lib/engine.ts             日期、出题、BQ、可重放结算纯逻辑
src/lib/actions.ts            Zod 输入校验和角色化动作
src/lib/grading.ts             OpenAI-compatible 评分与回退
src/lib/server/               签名会话、Supabase 事务和服务端题库
src/lib/demo.ts               独立的本机演示数据
src/lib/types.ts              类型定义
supabase/migrations/          Postgres 表、RLS、原子提交函数
supabase/seed.sql             112 道题的数据库 seed
scripts/build-bank.py         原创题库生成源，Python 3 标准库
data/questions.json          应用的版本化题库（由脚本生成）
tests/                        Vitest + PGlite 集成测试
DESIGN.md                     配色、字体、布局和动效说明
```

题库共 112 道原创题：40 ML、30 AI/LLM、20 SQL、10 Python/pandas、12 BQ。每题包含 ID、难度、英文题干和 3–6 条 rubric；SQL 另有 schema 和参考查询。`data/questions.json` 是运行时版本化题库，`question_bank` 表是其可检查的数据库镜像。编辑生成源后运行 `npm run seed:generate`，重新执行 seed 并部署应用；只改数据库镜像不会改变已部署题库。

为保持双人应用简单，Postgres 使用一个 `game_state` JSONB 聚合行，内含项目、每天的快照、答案、审核与兑换记录。每次写入通过 `commit_game(expected_revision, next_state)` 原子比较版本；冲突重读重算，最多八次。每个动作带 UUID 去重，重复调用、并行请求或反复读取不会重复加分或扣罚。它适合本项目的一对玩家 / 裁判，不是多租户产品。

RLS 和数据库权限禁止浏览器读写游戏聚合、参考题表或直接调用提交函数；浏览器从不直接连接 Supabase。API 先验证服务器签名的会话 cookie（HMAC-SHA256，密钥为 `REFEREE_KEY`），玩家会话还须与当前玩家名字一致，之后才使用服务端 key 操作数据。会话 cookie 为 HttpOnly、SameSite=Lax，生产环境带 Secure；HTTP 写请求还会检查同源 Origin。修改 cookie 内容会使签名失效，用户无法通过修改客户端 role 成为裁判。

备份：在 Supabase SQL Editor 导出 `select revision, state, updated_at from public.game_state where id = 1;`（玩家名字也在其中）。数据只属于这一对用户；请勿让多个正式 Vercel 项目共享同一数据库用于不同训练营。

## 验证

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

测试覆盖：全部最低项、超额积分、关闭前不罚、冻结保连胜、周补卡上限、罚金累计和兑换、里程碑、人工审核延迟、覆盖后重放、设置快照、跨午夜、春秋 DST、类别去重、BQ 不同日两阶段及毕业后复述、角色权限、输入校验、重复动作、模型错误回退；名字进入与名字锁定、裁判密钥、伪造 / 篡改 cookie、改名后旧会话失效、跨站请求。

PGlite 在本机运行真正的 Postgres 引擎：验证建表迁移、RLS / grants、并发版本冲突；执行全部 20 条 SQL 参考答案，并对时区、NULL、并列次序和 join 膨胀做结果断言。测试不会连接或修改你的数据库。

浏览器验收记录见 `QA.md`。没有配置真实密钥前，真实 Supabase 连接、真实 LLM 调用、Vercel 线上 cron 不算已验证。

## 设计

按 Anthropic 官方 Frontend Design 指导，结合 UI-UX-Pro-Max 和 Emil 的交互准则：冰蓝与钴蓝、柠檬黄奖励、路线图与星星、不同形态的任务和奖励区域；不做默认 SaaS 控制台。字体自托管，无运行时 Google Fonts 请求。手机底部导航、键盘可见焦点、原生 dialog 焦点约束和 reduced-motion 样式均包含在内。
