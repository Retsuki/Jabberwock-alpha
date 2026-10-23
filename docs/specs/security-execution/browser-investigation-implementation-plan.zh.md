# 浏览器调查实施计划

[English](browser-investigation-implementation-plan.md) | 中文

> 新增私有浏览器适配器，连接 Worker 传输与凭据 UI，然后验证本地登录和桌面操作。三个阶段涉及约 12 个源码/测试文件及配对文档。不更改版本、不持久保存凭据、不自动重启调查。

## 阶段一：浏览器与传输

- [x] 实现 `src/security-worker-browser.ts`，扩展 `src/security-http.ts` / `src/security-worker-tools.ts`，提供受检浏览器传输、共享额度和私密 Cookie。

## 阶段二：Worker 与所有者控制

- [x] 在 `src/security-workers.ts` 连接浏览器释放和提示；通过 `src/client/WorkerChat.tsx` 及既有远程绑定提供仅内存凭据配置。

## 阶段三：验证

- [x] 运行针对性真实浏览器、传输、服务和 UI 测试、产物/检查构建，并检查桌面截图。单独记录真实模型验证。

## 限制

保留无关修改。保持现有 HTTP 行为、权限和持久化格式。不导入实验性提供者、不在 Session 保存登录秘密、不提交或推送。
