# 浏览器调查验证

[English](browser-investigation-verification.md) | 中文

## 已验证行为

2026-10-20，六个针对性文件中的 117 项测试通过，包括九项真实 Chrome 适配器测试，以及经过 Worker 传输的真实本地 HTTP 登录夹具。夹具提交表单、保留 HttpOnly Cookie，并再次加载认证后的账户页面。范围拒绝不消耗目标请求，额度耗尽阻止后续请求，保存的公开证据不含测试密码和会话 Cookie。服务和组件测试覆盖凭据替换、清除、所有者访问、授权变更和密码输入清空。

最终产物构建通过七项检查，随后的构建检查通过 Host 和 Client 两项检查。针对性源码 lint 与既有无关诊断分别记录。未更改持久化 Worker 记录格式。

## 桌面证据

隔离桌面应用在未选择 Worker 时显示浏览器登录，并遮蔽密码输入。虚构任务的操作确认仍描述旧的仅 GET 权限，在编辑约束后正确拒绝保存凭据；未绕过确认。成功保存/清除路径由服务及组件测试覆盖，不声称真实桌面保存成功。截图通过 `verify.py ui` 登记。

- 设置：`/tmp/jw-browser-login-settings.png`。
- 旧策略拒绝：`/tmp/jw-browser-login-policy-check.png`。
- 真实本地认证后页面：`/tmp/jw-browser-authenticated-page.png`。

## 限制

本次未运行真实模型自主浏览器调查。浏览器状态仅持续一个 Worker；凭据设置持续当前 Host 进程。不支持跨来源 SSO、307/308 重定向及子资源重定向。附加认证需要所有者介入。既有请求额度包含页面子资源，复杂应用可能在加载完成前耗尽。本实现不声称与 ARTEX 完全等同。
