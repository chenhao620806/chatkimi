# KIMI CYBER 部署指南

## 方案一：Vercel 部署（推荐 ✅）
Vercel 天然支持 Next.js + API Routes，适合有后端接口的应用。

### 1. GitHub 推送代码
```bash
cd gemini-chat
git init
git add .
git commit -m "feat: KIMI CYBER - 多模态聊天应用"
git branch -M main
git remote add origin https://github.com/你的用户名/gemini-chat.git
git push -u origin main
```

### 2. Vercel 部署
1. 访问 https://vercel.com
2. 点击 "New Project" → 导入 `gemini-chat` 仓库
3. 配置环境变量：
   - `SILICONFLOW_API_KEY` = `sk-ervkdtntadcqdsmyrnelrcuwmxcsdixdhxbxjvxksanmpsrv`
4. 点击 Deploy！🎉

部署后访问：`https://gemini-chat.vercel.app`（Vercel 自动分配）

### 3. 自定义域名（可选）
在 Vercel 项目 Settings → Domains 添加你自己的域名。

---

## 方案二：GitHub Pages 部署
⚠️ 注意：GitHub Pages 只支持静态页面，不支持 API Routes。
如需此方案，需要将 `/api/chat` 改为调用前端直接调用 SiliconFlow API。

---

## 环境变量说明

项目使用环境变量存储敏感信息：

| 变量名 | 说明 | 获取地址 |
|--------|------|----------|
| `SILICONFLOW_API_KEY` | 硅基流动 API Key | https://siliconflow.cn/ |

本地开发时，在项目根目录创建 `.env.local`：
```bash
SILICONFLOW_API_KEY=sk-your-key-here
```

---

## 已配置的安全措施
- ✅ `.env*` 已在 `.gitignore` 中，敏感信息不会上传
- ✅ API Key 存储在服务端环境变量中
- ✅ `.env.example` 作为模板供参考
