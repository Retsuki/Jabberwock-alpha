---
kind: upgrade-guide
description: "Desktop on macOS no longer requests administrator authentication to install the dsh command; a non-writable /usr/local/bin now shows a manual sudo command."
---

# Install the macOS dsh command manually when /usr/local/bin is not writable

English | [中文](guide.zh.md)

## Change

Manage dsh Command on macOS used to run the bundled Node runtime and `command-manager.js` as root through an administrator prompt when `/usr/local/bin` rejected the write with `EACCES` or `EPERM`. Desktop now performs the operation with the current user's rights only and never runs bundled code as root. When the write is rejected, the dialog reports that administrator rights are required and shows the command to run in a terminal.

Users whose `/usr/local/bin` is missing or not writable, typically on Apple Silicon machines without Homebrew's Intel prefix, are affected. Windows behavior and a writable `/usr/local/bin` are unchanged.

## Migration

1. Copy the `sudo ln -s '<app resources>/runtime/cli/bin/dsh' /usr/local/bin/dsh` command from the error dialog and run it in a terminal. Create the directory first with `sudo mkdir -p /usr/local/bin` when it is missing.
2. Reopen Manage dsh Command. Confirm the dialog reports that the Desktop command is installed, and that `dsh --version` runs in a new terminal.
3. To avoid the manual step, make `/usr/local/bin` writable by your user before choosing Install or Repair.
