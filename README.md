# 国际商务导论 · 手机端在线刷题版 (H5 + PWA)

本目录是专为手机浏览器、微信内置网页及桌面全屏 App 体验打造的**纯前端静态 H5 + PWA 刷题站**。

- **零后端依赖**：内置全部 **12 章 63 节 288 道题目与完整解析**，无需本地电脑开机或运行任何服务器，部署后随时打开即可刷题。
- **数据本地保存与跨端互通**：自动使用 `localStorage` 保存刷题记录、错题本与收藏夹，支持一键导出 `.json` 文件或复制 JSON 文本（与原网页版、微信小程序版存档格式完全兼容）。
- **PWA 离线可用**：支持添加到手机主屏幕，像原生 App 一样无地址栏全屏运行，断网/飞行模式下依然可正常刷题。

---

## 一、目录结构

```text
mobile-web/
├── index.html          # 手机端入口页面（含 viewport 安全区、iOS Safari 与 PWA 元标签）
├── manifest.json       # PWA 桌面安装清单（全相对路径）
├── sw.js               # Service Worker 离线缓存脚本
├── css/app.css         # 移动端自适应样式、单手底栏与深浅色主题
├── js/questions.js     # 内置静态题库（288 题完整数据）
├── js/app.js           # 练习 / 背题 / 模考 / 错题本 / 滑屏切题与本地持久化逻辑
├── icons/              # 高清桌面图标（180x180 iOS 图标、192/512 PNG 与 SVG）
├── scripts/build.mjs   # 零依赖构建与静态产物校验脚本
├── dist/               # 压缩优化后的纯静态生产目录（可直接拖拽上传发布）
├── vercel.json         # Vercel 静态托管配置
├── netlify.toml        # Netlify 静态托管配置
└── _headers            # Cloudflare Pages 缓存头配置
```

> 本地如需重新生成 `dist/`，在 `mobile-web/` 目录下执行 `npm run build` 即可（无需 `npm install` 安装任何第三方包）。

---

## 二、3 分钟免费上线获取永久 HTTPS 链接（任选其一）

### 方案 A：Cloudflare Pages（最快！免 Git，直接拖拽上传 30 秒上线，国内访问稳定）
1. 注册并登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 左侧菜单点击 **Workers 和 Pages (Workers & Pages)** -> 点击 **创建 (Create)** -> 切换到 **Pages** 标签页 -> 点击 **上传资产 (Upload assets / Direct Upload)**。
3. 输入一个项目名称（例如 `ib-quiz`），点击创建项目。
4. 直接将本目录下的 **`dist` 文件夹**（或整个 `mobile-web` 文件夹）拖入上传框，点击 **部署站点 (Deploy site)**。
5. 几秒后即可获得永久免费 HTTPS 链接：`https://<你的项目名>.pages.dev`，直接发到手机微信或浏览器即可打开！

### 方案 B：Vercel（支持绑定 GitHub 自动更新或 CLI 一键发布）
**方式 1（命令行最快发布）：**
```bash
cd mobile-web
npx vercel --prod
```
按提示登录后一路回车，10 秒即可拿到 `https://xxx.vercel.app` 永久 HTTPS 链接。

**方式 2（GitHub 网页导入）：**
1. 将代码推送到 GitHub 仓库，登录 [Vercel](https://vercel.com/) 点击 **Add New -> Project** 导入仓库。
2. 将 **Root Directory（根目录）** 设置为 `mobile-web`（会自动识别 `vercel.json`）。
3. 点击 **Deploy**，完成后即可获得 HTTPS 链接。

### 方案 C：GitHub Pages（完全免费，已做好子路径兼容不会白屏）
1. 在 GitHub 新建一个公开仓库（例如 `ib-quiz`）。
2. 将 `mobile-web/dist/` 目录下的所有文件上传到仓库根目录（也可上传整个项目，本版本全部采用 `./` 相对路径，无论是根目录还是 `/仓库名/mobile-web/` 子目录均可正常打开）。
3. 进入仓库 **Settings -> Pages**，在 **Build and deployment** 下选择 `Deploy from a branch`，分支选择 `main` / `/(root)` 并点击 **Save**。
4. 等待约 1 分钟，即可通过 `https://<你的GitHub用户名>.github.io/<仓库名>/` 访问（若访问子目录则加上 `/mobile-web/`）。

---

## 三、如何把网页「添加到手机主屏幕」（像原生 App 一样全屏离线刷题）

> 提示：你也可以直接点击页面右上角的 **📱 下载箭头图标** 查看设备专属引导或一键安装。

### 1. 如果在「微信」内点开链接
微信内置浏览器不支持直接创建桌面图标：
- 点击微信右上角 **`···`** -> 选择 **「在默认浏览器中打开」**（iPhone 会自动跳到 Safari，安卓会跳到系统浏览器），然后按下方步骤添加。

### 2. iPhone / iPad（使用 Safari 浏览器）
1. 用 **Safari** 打开你的线上 HTTPS 链接。
2. 点击屏幕底部的 **「分享」图标**（方框带向上箭头）。
3. 在弹出菜单中向下滑动，点击 **「添加到主屏幕」** -> 点击右上角 **「添加」**。
4. 返回手机桌面即可看到 **「商务刷题」** 独立图标，点开即为无地址栏全屏 App，且支持断网离线刷题！

### 3. Android 手机（Chrome / Edge / 系统浏览器）
1. 用 **Chrome / Edge** 或手机自带浏览器打开 HTTPS 链接。
2. 点击网页右上角的 **📱 图标** 点击「**一键安装到手机桌面**」；或者点击浏览器右上角/右下角菜单 **`⋮`** -> 选择 **「安装应用」** 或 **「添加到主屏幕」**。
3. 确认添加后即可从桌面随时秒开使用。
