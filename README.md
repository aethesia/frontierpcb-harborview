# FrontierPCB Harbor Viewer（静态展示版）

纯静态网站。评测列表、任务、比较和轨迹均读取预生成的数据，搜索、筛选和分页在浏览器中完成。无需 Python、Harbor、数据库、API 服务或云函数。

保留 5 个批次、549 条实际试验、489 份 Harbor ATIF 轨迹，以及原始日志、验证结果和 PCB 附件。GPT 缺失的 1 条样本仍按原有统计口径计入总分母 550，不虚构轨迹。Opus 展示名称保持正常命名。

指标保留 pass@1、avg@3、pass@3 和 Average Time。Average Time 仍为有效 agent 时间；超时按 8 小时，时间戳不足按既有兜底口径计入，相关依据保留在数据内部。单路批次不展示三路指标。删除、上传、登录和启动评测等操作已移除。

## 本地打开

安装 Node.js 20 或更新版本，在此目录运行：

```sh
npm start
```

打开 `http://127.0.0.1:8090`。Windows 也可运行 `start.ps1`，后台启动使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Background
```

`-Port 8091` 可切换端口。Linux/macOS 可运行 `sh start.sh`。

这里的服务只负责发送静态文件。浏览器需要通过 HTTP 读取 JavaScript 模块和压缩数据，不能双击 `index.html` 用 `file://` 打开。也可使用任意支持 SPA 回退的静态文件服务器。

## 部署到 Vercel

以 `frontierpcb-harborview` 为项目根目录，`index.html`、`assets/`、`fonts/` 和完整的 `data/` 均直接放在根目录。已提供 `vercel.json`：

- Framework Preset：Other。
- Build Command：`npm run build`（只检查静态文件完整性）。
- Output Directory：`.`（项目根目录）。
- 无需环境变量、后端或云函数。
- 深层页面刷新通过 SPA rewrite 返回 `index.html`；数据和资源文件直接读取。

数据已压缩并按内容去重，部署资源合计约 947 MiB；轨迹和日志按需加载，首页不会下载全部数据。请保留完整数据目录，首次部署需要上传这些文件。本地验证已通过，尚未执行线上部署。

## 目录

- `index.html`、`favicon.ico`、`assets/`、`fonts/`、`data/`：全部可部署网站内容，直接位于根目录。
- `preview.mjs`、`start.ps1`、`start.sh`：本地静态预览。
- `validate.mjs`：构建前完整性检查。
- `package.json`、`vercel.json`：运行和部署配置，无第三方 npm 依赖。

页面基于 Harbor 0.23.0 Viewer 修改；许可证见 `HARBOR-LICENSE` 和 `THIRD_PARTY_NOTICES.md`。
