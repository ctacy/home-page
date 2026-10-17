# home-page

沈超的个人主页与在线工具集 —— <https://ctacy.cc/>

纯静态站点：原生 HTML / CSS / ES5 JavaScript，无框架、无构建步骤、无第三方依赖。

## 内容

- **主页** `index.html`：关于、成长足迹、技能、服务与合作流程、联系方式。浅色 / 深色双主题。
- **在线工具** `tools.html`：34 个纯前端工具，全部在浏览器本地计算，输入内容不上传服务器。
  - JSON：格式化（支持 `//` 与 `/* */` 注释）、树形视图与 JSONPath 查询、压缩转义、排序、与 CSV / XML / YAML 互转、生成带文档注释的 C# 实体与 TypeScript 接口
  - 格式化：SQL、XML、CSS（含 SCSS / LESS 行注释）
  - 编码转换：Base64、URL、Escape、Unicode、Base32、Punycode、摩斯密码
  - 哈希与加密：MD5、SHA 全系列、HMAC、文件哈希、CRC、AES、随机密码、UUID / GUID、JWT 解码与验签
  - 开发辅助：SQL 建表转 C# 实体、Unix 时间戳、文本对比、正则测试、变量命名转换、带宽换算

## 本地预览

```bash
python -m http.server 8000    # 访问 http://localhost:8000/
```

直接双击 `index.html` 也能打开；剪贴板相关功能在 `file://` 下会走兼容分支。

## 测试

```bash
node tests/run.js             # 单元测试（可附分类名只跑部分，如 node tests/run.js json crypto）
```

浏览器冒烟测试：用浏览器打开 `tests/smoke.html`，页面顶部显示 `PASS` 即通过。

## 目录

```
index.html  tools.html  md5.html(旧链接跳转)
css/        tokens.css 设计变量 · style.css 主页 · tools.css 工具页
js/         main.js 主题与公共交互 · tools/ 工具内核与各分类工具
tests/      单元测试与浏览器冒烟测试（不部署）
```
