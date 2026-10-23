---
kind: upgrade-guide
description: "Remote Gateway 限制 WebSocket 消息大小和每个套接字的并发流数，并向非所有者 Peer 隐藏未分类的错误消息。"
---

# 调整 Remote 客户端以适应 Gateway 限制和错误披露规则

[English](guide.md) | 中文

## 变更

Remote Gateway（`@deepseek-ai/dsh-api-gateway`）执行三项此前不存在或没有上限的限制：

- `maxFrameBytes`（默认 16777216）：WebSocket 消息超过此大小时，以代码 1009 关闭套接字。
- `maxStreamsPerConnection`（默认 256）：一个套接字上的并发逻辑流数超过此值后，新的 `open` 仅使该流失败，并返回新代码 `gateway/stream-limit`。
- 对于主体不是所有者的 Peer，未分类的异常返回 `gateway/internal` 和固定消息 `internal error`；所有者仍收到异常消息，已分类的 `RemoteError` 代码对所有 Peer 均保持不变。

发送超过 16 MiB 消息、在一个套接字上保持超过 256 个并发流，或解析非所有者 Peer 的 `gateway/internal` 消息的客户端会受到影响。

## 迁移

1. 拆分上行载荷，使每条消息小于 `maxFrameBytes`，并将关闭代码 1009 视为载荷大小错误。
2. 将 `gateway/stream-limit` 作为可重试的单流错误处理：在同一套接字上的其他流结束后重新打开。
3. 不再从非所有者 Peer 的 `gateway/internal` 消息中读取诊断文本；请改为查看 Host 日志。
4. 如需修改限制，请在 `cordis.yml` 的 `typertGateway` 条目下的 `config` 中设置 `maxFrameBytes` 或 `maxStreamsPerConnection`；参阅[配置目录](../../../config-catalog.zh.md)。在一个套接字上打开 257 个流，检查是否仅第 257 个流以 `gateway/stream-limit` 失败，以确认设置生效。
