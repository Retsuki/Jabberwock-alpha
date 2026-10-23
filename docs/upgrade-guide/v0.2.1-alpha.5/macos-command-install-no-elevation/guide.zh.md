---
kind: upgrade-guide
description: "macOS Desktop 安装 dsh 命令时不再请求管理员认证；当 /usr/local/bin 不可写时，会显示手动执行的 sudo 命令。"
---

# 在 /usr/local/bin 不可写时手动安装 macOS dsh 命令

[English](guide.md) | 中文

## 变更

此前，macOS 的 Manage dsh Command 在写入 `/usr/local/bin` 遇到 `EACCES` 或 `EPERM` 时，会通过管理员提示以 root 身份运行随附的 Node 运行时和 `command-manager.js`。Desktop 现在仅使用当前用户权限执行操作，不会以 root 身份运行随附代码。写入被拒绝时，对话框会说明需要管理员权限，并显示可在终端运行的命令。

此变更影响 `/usr/local/bin` 不存在或不可写的用户，常见于没有 Homebrew Intel 前缀的 Apple Silicon 机器。Windows 行为以及可写的 `/usr/local/bin` 均不受影响。

## 迁移

1. 从错误对话框复制 `sudo ln -s '<app resources>/runtime/cli/bin/dsh' /usr/local/bin/dsh` 命令，并在终端运行。目录不存在时，先运行 `sudo mkdir -p /usr/local/bin` 创建目录。
2. 重新打开 Manage dsh Command。确认对话框显示 Desktop 命令已安装，并在新终端确认 `dsh --version` 可运行。
3. 若要避免手动步骤，请在选择 Install 或 Repair 前，使当前用户对 `/usr/local/bin` 具有写入权限。
