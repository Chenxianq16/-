# CET6 精听

一套面向个人备考的六级听力训练网站。当前包含 2023-2025 年 6 月与 12 月
六级听力各第 1 套，并保留 2021 年 6 月第 1 套，共 7 套。支持整篇训练、
按题型逐题检测、逐句盲听默写、词级差异、AI 错因分析、复杂句与固定搭配
讲解，以及本机错词本。

## 功能

- 整篇训练：盲听完整篇章，再完成该篇章对应的选择题。
- 逐题训练：按长对话、篇章、讲座/讲话筛选并逐题作答。
- 自由跳转：盲听、答题、逐句默写和复盘可随时切换。
- 篇章复盘：查看答题与逐句结果，点击任意句子回到默写。
- 逐句默写：可无限重听，提交前隐藏原文与中文。
- 词级对照：标出写对、写错、漏写和多写的词，并计算匹配率。
- 双维错因：AI 给出“听力识别/词汇/语法/逻辑/注意力/拼写”等标签，
  用户可确认“其实认识 / 确实不认识 / 不确定”。
- AI 讲解：复杂句结构、固定搭配、选项依据和重点词。
- 本地记录：进度、答题结果和错词保存在当前浏览器。
- 低成本：前端为纯静态站点，只有 AI 请求经过 Serverless 代理。

## 本地运行

```powershell
npm run serve
```

打开 `http://127.0.0.1:8080`。本地服务器支持音频 Range 请求，逐句跳转
不需要预先生成切片。

```powershell
npm test
npm run validate:data
```

## DeepSeek AI 代理配置

DeepSeek API Key 不能放进浏览器。先将 `worker/` 部署到 Cloudflare Workers：

```powershell
cd worker
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

模型默认使用 `deepseek-chat`。随后在网页右上角的
“AI 设置”中填写 Worker 地址，例如：

```text
https://cet6-listening-ai.<your-subdomain>.workers.dev/api/analyze
```

`ALLOWED_ORIGIN` 已设置为你的 GitHub Pages 域名，避免其他人调用
该代理消耗你的 DeepSeek API 额度。本机开发时可设为
`http://127.0.0.1:8080`。

当前线上 Worker 地址：

```text
https://lingosu.online/cet6-listening-ai/api/analyze
```

## GitHub Pages

推送到 GitHub 仓库 `main` 分支后，在仓库 Settings -> Pages 中将 Source
设为 GitHub Actions。工作流文件位于 `.github/workflows/pages.yml`。

## 数据重建

`scripts/build-content.mjs` 可从
[CET-6 Listening Study](https://github.com/getfine333-ux/cet6-listening-study)
的 `web/dist/data.js` 生成多套数据。音频使用
`npm run fetch:audio` 下载。普通运行不需要重建。

## 素材许可

听力、原文、题目和答案按 CC BY 4.0 来源声明使用，完整署名与权利边界见
[ATTRIBUTION.md](ATTRIBUTION.md)。项目代码采用 MIT License。
