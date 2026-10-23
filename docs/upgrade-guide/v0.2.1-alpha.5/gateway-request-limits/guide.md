---
kind: upgrade-guide
description: "The Remote Gateway caps WebSocket message size and concurrent streams per socket, and hides unclassified error messages from non-owner Peers."
---

# Adapt Remote clients to Gateway limits and error disclosure

English | [中文](guide.zh.md)

## Change

The Remote Gateway (`@deepseek-ai/dsh-api-gateway`) enforces three limits that were previously absent or unbounded:

- `maxFrameBytes` (default 16777216): a WebSocket message larger than this closes the socket with code 1009.
- `maxStreamsPerConnection` (default 256): an `open` beyond this many concurrent logical streams on one socket fails only that stream with the new code `gateway/stream-limit`.
- A Peer whose principal is not the owner receives `gateway/internal` with the fixed message `internal error` for an unclassified exception; the owner still receives the exception message, and classified `RemoteError` codes are unchanged for every Peer.

Clients that send messages above 16 MiB, hold more than 256 concurrent streams on one socket, or parse the `gateway/internal` message of a non-owner Peer are affected.

## Migration

1. Split uplink payloads so each message stays below `maxFrameBytes`, and treat close code 1009 as a payload-size failure.
2. Handle `gateway/stream-limit` as a retryable per-stream failure: reopen after another stream on the socket finishes.
3. Stop reading diagnostic text from `gateway/internal` messages on non-owner Peers; read the Host log instead.
4. To change the limits, set `maxFrameBytes` or `maxStreamsPerConnection` in the `typertGateway` entry's `config` in `cordis.yml`; see the [config catalog](../../../config-catalog.md). Confirm by opening 257 streams on one socket and checking that only the 257th fails with `gateway/stream-limit`.
