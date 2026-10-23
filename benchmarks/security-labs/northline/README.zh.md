# NORTHLINE 本地 EC 基准

[English](README.md) | 中文

NORTHLINE 是用于本地诊断评估的仅脆弱版 Next.js 商店应用。它提供十二件商品、搜索、浏览器持久购物车、顾客登录、资料编辑、模拟结账、订单历史和管理视图。所有人员、地址、订单及支付均为虚构。Docker Compose 仅在 IPv4 环回公开目标；直接 Node 模式也绑定环回。

## 运行目标

从仓库根目录执行，需要 Docker Desktop 或 Docker Engine，以及 Docker Compose：

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml up --build -d --wait
```

打开 `http://127.0.0.1:18761`。容器使用非 root 用户、只读根文件系统、独立数据卷及临时缓存。仅由固定目的地 TCP 入口公开此环回端口。入口连接入口网桥和内部实验网络，只向 NORTHLINE 转发原始数据；目标仅连接内部网络，没有外部路由。不挂载宿主目录或 Docker socket。启动 Compose 前先停止占用 18761 端口的直接运行副本。停止容器：

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml down
```

构建时下载依赖；运行时不使用外部素材、身份或支付服务。依赖和 npm 锁仅属于本目标；Jabberwock 依赖不变。Next.js 刻意固定到[官方公告影响范围](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)内的 14.2.24，因此本夹具出现 npm 安全警告符合预期。本目标不是部署模板。

也可选择直接使用 Node.js 22 启动，此方式没有容器隔离：

```sh
npm ci --prefix benchmarks/security-labs/northline/app --ignore-scripts --no-audit --no-fund
npm run build --prefix benchmarks/security-labs/northline/app
npm run start --prefix benchmarks/security-labs/northline/app
```

直接模式绑定 `127.0.0.1`；`LAB_PORT` 可选择另一端口。`LAB_CONTAINER=1` 绑定容器全部接口，只能配合提供的仅环回 Compose 配置使用。两种模式均检查精确 IPv4 环回 Host 头。

## 测试账户

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 顾客 Alice | alice@northline.test | northline-alice-2026 |
| 顾客 Bob | bob@northline.test | northline-bob-2026 |
| 管理员 | admin@northline.test | northline-admin-2026 |

这些仅为夹具凭据。运行时会话使用新的进程私有签名密钥和 HttpOnly Cookie。重启后需重新登录。容器订单与资料编辑保存在 `northline-data` 命名卷内的 `/app/.data/store.json`，直接模式保存在 `app/.data/store.json`；购物车保存在该浏览器本地存储。Compose 停止后数据卷仍保留。没有公开重置端点或修复模式开关。

恢复容器种子数据时运行以下命令再重新启动。**这会永久删除该 Compose 项目的实验数据卷及其中订单、资料编辑。** 浏览器购物车需另行清理。直接模式则先停止目标，再移走生成的 JSON 文件。

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml down -v
```

## 验证目标

本地目标运行时执行：

```sh
node benchmarks/security-labs/northline/evaluation/smoke.mjs
node benchmarks/security-labs/northline/evaluation/browser-smoke.mjs
```

API 基线验证正常购物、授权对照和预期基准条件。浏览器检查使用基准既有 Playwright 依赖及已安装 Chrome；`LAB_CHROMIUM` 可选择其他已安装 Chromium。覆盖搜索、分类、登录、购物车、结账、订单历史、账户与管理员视图、移动端溢出和浏览器错误。截图默认位于系统临时目录下的 `jw-northline`；`LAB_SHOT_DIR` 可改目的地。`LAB_ORIGIN` 可选择另一 IPv4 环回目标。

## 独立诊断

向 Jabberwock 提供已登记服务来源和普通顾客账户，然后评估其保存的发现与报告。不向诊断模型提供 `evaluation/expectations.json`、本应用源码或冒烟脚本：这些是仅操作员预期结果。清单只包含最低案例，不是穷尽列表。受影响版本本身不是已确认影响；发现需要可重复请求/响应或认证观测证据。本地 HTTP Cookie 属性属于实验环境，不能默认作为生产发现。

不包含修复版本。首次诊断后再依报告修改并重新测试；基线冒烟成功绝不计为 Jabberwock 的发现。已执行检查见[验证记录](../../../docs/specs/security-execution/ec-lab-verification.zh.md)。
