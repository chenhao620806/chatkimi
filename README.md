# Kimi Chat (gemini-chat) 开发文档

## 📌 项目简介

基于 Next.js 16 + Tailwind CSS 的 AI 多模态聊天应用，支持与 Kimi、GLM 等大模型对话。

**在线访问**：http://localhost:3006

---

## 🚀 快速上手

### 1. 环境要求

- Node.js 18+
- npm 或 yarn
- API Key（硅基流动）：`sk-ervkdtntadcqdsmyrnelrcuwmxcsdixdhxbxjvxksanmpsrv`

### 2. 启动项目

```bash
cd C:\Users\Administrator\WorkBuddy\Claw\gemini-chat
npm install
npm run dev -- -p 3006
```

### 3. 访问

打开浏览器访问：http://localhost:3006

---

## 📁 项目结构

```
gemini-chat/
├── src/
│   └── app/
│       ├── page.tsx          # 主页面（所有UI和逻辑）
│       ├── layout.tsx        # 布局文件
│       └── globals.css       # 全局样式
├── package.json
├── next.config.ts
└── tailwind.config.ts
```

**主要文件说明**：

| 文件 | 说明 |
|------|------|
| `page.tsx` | 核心文件，包含所有组件、状态管理、API调用 |
| `api/chat/route.ts` | 后端 API 路由，转发到 OpenRouter |

---

## ⚙️ 核心功能

### 1. 多模态对话
- 支持文字、图片混合输入
- 自动识别并附加图片到消息

### 2. 支持的图片格式
- JPG/PNG/GIF/WebP（直接上传）
- **PDF** → Canvas 渲染为图片
- **Word (.docx)** → mammoth 转为 HTML 再渲染
- **Excel (.xlsx/.xls)** → xlsx 解析数据表格
- **TXT/MD** → 自定义代码风格渲染

### 3. @image:xxx 引用功能
- 输入 `@image:` 触发自动补全
- 支持模糊匹配历史图片
- 格式：`@image:图片名.png`

### 4. 模型切换
- **Kimi K2.6** (moonshotai) - 默认模型
- **GLM-5.1V** (zai-org) - 智谱视觉模型

### 5. 停止生成
- 加载中时，发送按钮变为红色停止按钮
- 点击立即终止请求

---

## 🔧 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.2.4 | 框架 |
| React | 19.2.4 | UI库 |
| Tailwind CSS | 4 | 样式 |
| Turbopack | - | 构建工具 |
| pdfjs-dist | 4.0.379 | PDF 渲染 |
| mammoth | ^1.8.0 | Word 解析 |
| xlsx | ^0.18.5 | Excel 解析 |
| OpenRouter SDK | ^0.12.20 | API 调用 |

---

## 📝 开发指南

### API 配置

API Key 和配置在 `src/app/api/chat/route.ts` 中：

```typescript
const apiKey = process.env.OPENROUTER_API_KEY || 
  "sk-ervkdtntadcqdsmyrnelrcuwmxcsdixdhxbxjvxksanmpsrv";
```

### 添加新模型

编辑 `page.tsx` 中的 `VISION_MODELS` 数组：

```typescript
const VISION_MODELS = [
  { id: "Pro/moonshotai/Kimi-K2.6", name: "Kimi K2.6", desc: "描述" },
  { id: "zai-org/GLM-4.5V", name: "GLM-5.1V", desc: "描述" },
];
```

### 添加新文件格式支持

在 `handleFileUpload` 函数中添加新的判断分支：

```typescript
} else if (ext === "新格式扩展名") {
  const newAttachments = await convertNewFormatToImage(file);
  // ...
}
```

然后实现转换函数：

```typescript
const convertNewFormatToImage = async (file: File): Promise<Attachment[]> => {
  // 实现转换逻辑
  // 返回 Attachment[] 数组
};
```

---

## 🐛 常见问题

### 1. pdfjs-dist 版本不匹配
- **问题**：`import("pdfjs-dist@版本号")` 不支持
- **解决**：使用 `import("pdfjs-dist")`，版本在 CDN URL 中指定

### 2. 动态导入必须在 async 函数中
- **问题**：`await` 在非 async 函数中报错
- **解决**：确保在 Promise 回调中使用 `await` 前先 await 出结果

### 3. AbortController 顺序
- **问题**：`Cannot read properties of null (reading 'signal')`
- **解决**：先创建 `new AbortController()`，再使用 `.signal`

---

## 📌 开发规范

### 1. 组件结构
- 所有组件和逻辑都在 `page.tsx` 中
- 使用 `"use client"` 声明客户端组件

### 2. 状态管理
```typescript
const [state, setState] = useState(initialValue);
const ref = useRef<HTMLInputElement>(null);
```

### 3. 文件上传处理
```typescript
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  // ...
};
```

### 4. 流式响应处理
```typescript
const reader = response.body?.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 处理 chunk
}
```

---

## 🎨 UI 配色

| 用途 | 颜色 |
|------|------|
| 主色 | `#6366f1` → `#8b5cf6` (紫色渐变) |
| 背景 | `#1e1e2e` (深色) |
| 强调色 | `#4a9eff` (蓝色) |
| 文字 | `#e0e0e0` (浅灰) |
| 错误/停止 | `#ef4444` (红色) |

---

## 📞 维护记录

| 日期 | 内容 |
|------|------|
| 2026-04-23 | 初始创建，基础聊天功能 |
| 2026-04-23 | 添加 PDF/Word/Excel/TXT/MD 转换支持 |
| 2026-04-23 | 添加 @image:xxx 引用功能 |
| 2026-04-23 | 简化模型列表，添加停止生成功能 |
