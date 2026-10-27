# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-10-23
- Primary product surfaces: 独立中文网页，用户已确认成员通过链接访问；新增独立 /armory 角色装备页。
- Evidence reviewed: 项目初始为空；用户提出人员登记、集体消息、拼车刷怪/地图、装备分享。官网 https://www.projectdiablo2.com/ 确认 S14 Alliance。官方发布的暂定补丁说明 https://www.reddit.com/r/ProjectDiablo2/comments/1x2ntiz/project_diablo_2_season_14_alliance_tentative/ 说明公会及按模式分离的大厅。尚未核实公开公会 API。

## Brand
- Personality: 安静、可靠、有暗黑游戏氛围的公会营地。
- Trust signals: 真实数据、明确状态、网站在线与游戏在线区分。
- Avoid: 虚构实时人数、假同步、过度发光、把普通网页包装成游戏内插件。

## Product goals
- Goals: 通过一个链接完成登记、通知、组队、装备互助；每个部署服务一个公会。
- Non-goals: 不后台定时同步角色，不读取登录后的账号私有库存或公会仓库，不操作游戏客户端，不自动发送游戏聊天消息。
- Success signals: 两个账号可以互相看到发布内容，拼车不超员，装备不重复预留，重启不丢数据。

## Personas and jobs
- Primary personas: 会长、普通成员、开车队长、装备捐赠者。
- User jobs: 邀请成员、查看角色、发布公告、确认已读、开车报名、预留装备。
- Key contexts of use: PC 游戏旁边开网页，手机查看公会动态。
- Quick gear sharing: 兼容现有 PD2 Trader 读取的游戏单件装备 JSON（quality/type/iLevel/stats），用户在游戏 Ctrl+C 后在分享表单主动粘贴；不后台监听或恢复剪贴板，不复用查价器登录令牌。文本与 JSON 只填入可编辑表单，不自动发布。生成 PNG 文字装备卡可下载/复制，保留原始词缀措辞与实际数值，不猜测技能触发字段。
- Contribution rewards: 成功次数由服务端统计已完成交付的装备记录，每条最多一次，所有模式历史累计；1/5/10/25/50 次分别领取营地新火/热心队友/营地支柱/公会守护者/传奇传火者。领取记录持久化且唯一；装备互助显示进度，成员名册显示已领取徽章和次数。

## Information architecture
- Primary navigation: 公会大厅、成员名册、拼车大厅、装备互助、消息公告、角色装备。
- Core routes/screens: 首次创建公会、邀请注册/登录、主应用、资料编辑弹窗、创建内容弹窗；/armory 支持角色链接导入、JSON 备用、穿戴槽位窗口和固定属性后建立分享草稿。用户指定删除下方筛选、搜索及卡片列表，只保留上方窗口。
- Content hierarchy: 当前身份与模式、可操作内容、参与/归属、日期和附加描述。

## Design principles
- Principle 1: 所有主要按钮都完成实际业务操作。
- Principle 2: 模式是组队和装备交互的硬约束，SC/HC 与天梯/非天梯不得误配。
- Principle 3: 公开角色可查询不等于归属已验证；快照显示来源和两个时间，导入不覆盖成员登记资料，也不自动发布装备。
- Tradeoffs: 单公会、单角色资料先闭环；多角色和多公会后续扩展。

## Visual language
- Color: 炭黑背景，暖灰卡片，古铜金强调，绿标识可参与，红标识错误。
- Typography: 系统中文无衬线，标题可用系统衬线；无需远程字体。
- Spacing/layout rhythm: 8px 基准；PC 左侧导航和宽内容区；清晰留白。
- Shape/radius/elevation: 12px 卡片、细边框、轻阴影。
- Motion: 只使用简短悬浮/焦点变化。
- Imagery/iconography: 内联 SVG；装备窗口可加载已核对的 PD2 官方物品图片，未知或加载失败时以槽位 SVG 和名称回退。远程图片仅限固定官方路径，不发送 Referer。

## Components
- Existing components to reuse: 无，空仓库。
- New/changed components: 导航、统计卡、队伍卡、装备卡、成员表、公告、表单弹窗、提示条。
- Variants and states: 空状态/可报名/已满/已结束；可领取/已预留/已交付/已撤回；已读/未读。
- Token/component ownership: public/styles.css 统一定义变量。

## Accessibility
- Target standard: 按 WCAG 2.2 AA 原则实现，未作正式合规认证。
- Keyboard/focus behavior: 原生 button、表单、dialog，明显焦点、关闭后恢复焦点。
- Contrast/readability: 正文至少 14px，次要信息保持可读。
- Screen-reader semantics: 语义导航、标题、label、表格、aria-live 通知。
- Reduced motion and sensory considerations: 尊重 prefers-reduced-motion，不仅靠颜色区分状态。

## Responsive behavior
- Supported breakpoints/devices: 360px 手机至桌面宽屏。
- Layout adaptations: 小屏横向导航，卡片单列，表格可横向滚动。
- Touch/hover differences: 装备窗口支持角色/佣兵、主/备用武器切换、悬停与键盘聚焦属性、点击固定、Esc 关闭；手机用点按与底部可滚动面板查看。用户指定仅展示角色穿戴（含备用武器）和佣兵装备，背包、仓库、方块等不进入窗口、筛选和列表。

## Interaction states
- Loading: 登录及提交期间禁用重复提交。
- Empty: 显示说明和创建入口，不自动塞入示例数据。
- Error: 展示服务器可理解的错误，保留表单输入。
- Success: 提示并刷新列表。
- Disabled: 不满足模式、满员、已关闭时显示原因。
- Offline/slow network: 显示断连提示，定期刷新恢复；不假报发布成功。

## Content voice
- Tone: 简洁中文，接近玩家用语。
- Terminology: 拼车、队长、装备互助、游戏模式、网站活跃。
- Microcopy rules: 解释按钮后果，通知是站内消息；不声称发送到游戏或社交平台。

## Implementation constraints
- Framework/styling system: Node.js 24 原生 HTTP + SQLite，原生 HTML/CSS/JavaScript，无第三方运行时依赖。
- Design-token constraints: 使用同一 CSS token 集。
- Performance constraints: 按需渲染，单次请求限制正文体积，限长输入。
- Compatibility constraints: 现代 Chrome/Edge/Safari；部署公网须 HTTPS 反向代理；首次设置仅允许服务器本机完成。
- Armory source: 已通过浏览器实测官方公开角色接口返回的角色、物品、佣兵及时间字段；Node 后台连通性受运行环境网络限制，必须保留官方 JSON 导入和明确错误状态。
- Test/screenshot expectations: 真实 HTTP 集成测试覆盖认证、权限、模式隔离、满员与重复预留；浏览器检查桌面/手机核心流程。

## Open questions
- [ ] 公网部署平台及域名 / 用户 / 决定最终可分享的公网地址。
- [ ] 是否需要 QQ、微信或 Discord 通知 / 用户 / 决定后续通知适配器。
- [ ] 官方是否提供允许使用的公会数据接口 / 后续核实 / 决定自动同步范围。
- [ ] 多角色、成员审核、多人管理员、密码找回 / 后续迭代 / 当前首版采用单角色和会长邀请。
