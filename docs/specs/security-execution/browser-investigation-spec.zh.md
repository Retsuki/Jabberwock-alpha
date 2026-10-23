# 浏览器调查工具

[English](browser-investigation-spec.md) | 中文

> Worker 在隔离 Chromium 中导航、检查、填写和提交登录表单，然后调查已认证页面。既有范围检查、HTTP 额度、审批、取消和公开证据保持权威。凭据和浏览器 Cookie 保持私密；无需更改持久化记录格式。

## 所有者流程

所有者从 Worker 区打开浏览器登录设置，输入获准的来源、用户名和密码，再通过既有主代理启动任务。凭据保存在 Host 内存中，直到清除或 Host 停止。Worker 读取页面，向登录操作提供选择器，然后在同一浏览器上下文继续。会话记录公开浏览器操作和脱敏观测。缺少凭据、不支持的附加认证和被拒请求会明确报告，不会声称登录成功。

## 操作

Worker 获得导航、页面快照、点击、普通字段填写和私密凭据登录能力。登录接受选择器而非凭据值。浏览器 Cookie 和本地存储仅属于一个 Worker；另一个 Worker 或 Host 重启会使用全新上下文。既有所有者追加消息可指导运行中的 Worker。下载、持久配置、任意浏览器脚本及自动处理 CAPTCHA 或硬件认证不在本次实现内。

登录工具输入示例：`{"usernameSelector":"#username","passwordSelector":"#password","submitSelector":"button[type=submit]"}`。结果为脱敏页面快照；点击成功本身不能证明认证成功。

## 传输与生命周期

私有 Playwright 适配器负责延迟启动 Chromium、一个隔离上下文及等待完成的释放。每个拦截到的 HTTP 请求都使用既有固定 DNS 传输、范围规则、操作权限和执行所有者分配的请求额度，包括子资源与已认证请求。响应 Cookie 私下交付 Chromium；公开证据排除认证头和配置的凭据值。登录值只能提交到配置的来源。

阻止 Service Worker、WebSocket、下载和附加标签页。不可用的浏览器代理防止未处理的浏览器网络通道直接访问目标。重定向处理必须保留 HTTP 方法或报告不支持；不会假定拦截自动涵盖重定向。取消会关闭浏览器资源，并在释放 Worker 槽位前等待未完成请求。

## 验收

本地夹具验证经过受检传输的登录、Cookie 保留和认证后导航。测试覆盖被拒来源、重定向、额度耗尽、凭据遮蔽、取消及状态隔离。桌面 UI 验证 Worker 存在前的凭据配置、清除凭据和公开执行视图。模型执行与浏览器及 UI 验证分别报告。

## 参考

ARTEX 通过 Worker 增强提供浏览器 MCP 工具。产品适配器直接使用 Playwright，因为既有实验性 MCP 提供者没有逐请求安全传输注入，且禁止产品导入。Playwright 记录了 [Service Worker 路由限制](https://playwright.dev/docs/network#missing-network-events-and-service-workers)；其 MCP [来源过滤器不是安全边界](https://playwright.dev/mcp/configuration/options)。
