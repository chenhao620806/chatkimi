"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// pdfjsDist 会延迟初始化
let pdfjsLib: any = null;

interface Attachment {
  id: string;
  type: "image" | "file";
  name: string;
  base64: string;
  mimeType: string;
  previewUrl?: string;
  // 用于 @image:xxx 格式引用
  refId?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  timestamp: Date;
  reasoning?: string; // 思维模式推理内容
}

// 支持视觉的模型列表
const VISION_MODELS = [
  { id: "Pro/moonshotai/Kimi-K2.6", name: "Kimi K2.6", desc: "最新多模态，支持文本/图片" },
  { id: "zai-org/GLM-4.5V", name: "GLM-5.1V", desc: "智谱最新版视觉模型" },
];

// 快捷按钮配置
const QUICK_ACTIONS = [
  { id: "code", label: "写代码", prompt: "帮我写一段 Python 代码" },
  { id: "explain", label: "解释概念", prompt: "解释一下什么是机器学习" },
  { id: "analyze", label: "分析图片", prompt: "分析一下这张图片" },
  { id: "translate", label: "翻译", prompt: "帮我翻译这段英文" },
];

// 解析消息内容中的图片标记 {{img:N}} 并渲染（支持 Markdown 代码高亮）
const renderContentWithImages = (content: string, attachments?: Attachment[]) => {
  // 如果有图片，解析图片标记
  const hasImages = attachments && attachments.length > 0 && attachments.some(a => a.type === "image");
  
  // 简单 Markdown 解析：代码块和内联代码
  const renderMarkdownText = (text: string) => {
    const parts: React.ReactNode[] = [];
    const codeBlockPattern = /```(\w*)\n?([\s\S]*?)```/g;
    const inlineCodePattern = /`([^`]+)`/g;
    
    let lastIndex = 0;
    let match;
    let key = 0;
    
    // 先处理代码块
    while ((match = codeBlockPattern.exec(text)) !== null) {
      // 添加之前的文本
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index);
        // 处理内联代码
        parts.push(renderInlineCode(beforeText, `inline-${key}`));
        key++;
      }
      
      // 添加代码块
      const lang = match[1] || "text";
      const code = match[2].trim();
      parts.push(
        <pre key={`code-${match.index}`} className="my-3 p-4 rounded-lg overflow-x-auto" style={{
          background: "rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(0, 255, 255, 0.3)",
          boxShadow: "0 0 10px rgba(0, 255, 255, 0.1)",
          fontFamily: "'Fira Code', 'Consolas', monospace",
          fontSize: "13px",
          lineHeight: "1.6"
        }}>
          <code style={{ color: "#00ff88" }}>{code}</code>
        </pre>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // 添加剩余文本
    if (lastIndex < text.length) {
      const afterText = text.slice(lastIndex);
      parts.push(renderInlineCode(afterText, `inline-${key}`));
    }
    
    return parts.length > 0 ? parts : [renderInlineCode(text, "text-only")];
  };
  
  // 渲染内联代码
  const renderInlineCode = (text: string, baseKey: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const inlineCodePattern = /`([^`]+)`/g;
    let lastIndex = 0;
    let match;
    let idx = 0;
    
    while ((match = inlineCodePattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`${baseKey}-${idx++}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      parts.push(
        <code key={`${baseKey}-${idx++}`} className="px-1.5 py-0.5 rounded text-sm" style={{
          background: "rgba(255, 0, 128, 0.2)",
          color: "#ff0080",
          fontFamily: "'Fira Code', 'Consolas', monospace",
          fontSize: "0.9em"
        }}>
          {match[1]}
        </code>
      );
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      parts.push(<span key={`${baseKey}-${idx}`}>{text.slice(lastIndex)}</span>);
    }
    
    return parts.length > 0 ? parts : [<span key={baseKey}>{text}</span>];
  };
  
  // 如果有图片，解析图片标记
  if (hasImages) {
    const imgPattern = /\{\{img:(\d+)\}\}/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = imgPattern.exec(content)) !== null) {
      // 添加之前的文本（带 Markdown 渲染）
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(...renderMarkdownText(textBefore));
      }
      
      // 添加图片
      const idx = parseInt(match[1]);
      const att = attachments[idx];
      if (att && att.type === "image" && att.previewUrl) {
        parts.push(
          <img 
            key={`img-${idx}`} 
            src={att.previewUrl} 
            alt={att.name}
            className="inline-block max-w-48 max-h-48 rounded-lg my-2 mx-1 align-middle cursor-pointer hover:opacity-90 transition-opacity"
            style={{ 
              border: "2px solid rgba(0, 255, 255, 0.5)",
              boxShadow: "0 0 15px rgba(0, 255, 255, 0.3)"
            }}
          />
        );
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // 添加剩余文本
    if (lastIndex < content.length) {
      parts.push(...renderMarkdownText(content.slice(lastIndex)));
    }
    
    return <>{parts}</>;
  }
  
  // 无图片，纯 Markdown 渲染
  return <>{renderMarkdownText(content)}</>;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedModel, setSelectedModel] = useState(VISION_MODELS[0].id);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [topP, setTopP] = useState(0.7);
  const [topK, setTopK] = useState(50);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [enableThinking, setEnableThinking] = useState(false);
  const [thinkingBudget, setThinkingBudget] = useState(4096);
  const [stopSequences, setStopSequences] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showImageHint, setShowImageHint] = useState(false); // 显示图片提示
  const [cursorPosition, setCursorPosition] = useState({ top: 0, left: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  // 停止生成
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // 检测 @image: 输入并显示提示
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setInput(value);
    
    // 检测光标前是否有 @image:
    const textBeforeCursor = value.substring(0, cursorPos);
    const match = textBeforeCursor.match(/@image:([^\s]*)$/);
    
    if (match) {
      setShowImageHint(true);
      // 获取光标位置
      if (textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        setCursorPosition({
          top: rect.top - 10,
          left: rect.left + 20
        });
      }
    } else {
      setShowImageHint(false);
    }
  };

  // 处理 Ctrl+V 粘贴截图
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (isLoading) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // 检查是否是图片
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            const attachment: Attachment = {
              id: Date.now().toString() + i,
              type: "image",
              name: `截图_${new Date().toLocaleTimeString()}.png`,
              base64: base64,
              mimeType: item.type || "image/png",
              previewUrl: event.target?.result as string,
            };
            setAttachments((prev) => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [isLoading]);

  // 处理图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(",")[1];
        const attachment: Attachment = {
          id: Date.now().toString() + i,
          type: "image",
          name: file.name,
          base64: base64,
          mimeType: file.type,
          previewUrl: event.target?.result as string,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    }

    e.target.value = "";
  };

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      
      // 如果是支持的文档格式，转换为图片
      if (file.type === "application/pdf") {
        // PDF
        const pdfAttachments = await convertPdfToImages(file);
        if (pdfAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...pdfAttachments]);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            const attachment: Attachment = {
              id: Date.now().toString() + i,
              type: "file",
              name: file.name,
              base64: base64,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
        }
      } else if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // Word 文档
        const wordAttachments = await convertWordToImage(file);
        if (wordAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...wordAttachments]);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            const attachment: Attachment = {
              id: Date.now().toString() + i,
              type: "file",
              name: file.name,
              base64: base64,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
        }
      } else if (ext === "xlsx" || ext === "xls" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel") {
        // Excel 文件
        const excelAttachments = await convertExcelToImage(file);
        if (excelAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...excelAttachments]);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            const attachment: Attachment = {
              id: Date.now().toString() + i,
              type: "file",
              name: file.name,
              base64: base64,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
        }
      } else if (ext === "txt" || ext === "md" || ext === "markdown") {
        // 文本/Markdown 文件
        const textAttachments = await convertTextToImage(file);
        if (textAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...textAttachments]);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = (event.target?.result as string).split(",")[1];
            const attachment: Attachment = {
              id: Date.now().toString() + i,
              type: "file",
              name: file.name,
              base64: base64,
              mimeType: file.type,
            };
            setAttachments((prev) => [...prev, attachment]);
          };
          reader.readAsDataURL(file);
        }
      } else {
        // 其他文件，作为普通文件处理
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = (event.target?.result as string).split(",")[1];
          const attachment: Attachment = {
            id: Date.now().toString() + i,
            type: "file",
            name: file.name,
            base64: base64,
            mimeType: file.type,
          };
          setAttachments((prev) => [...prev, attachment]);
        };
        reader.readAsDataURL(file);
      }
    }

    e.target.value = "";
  };

  // 移除附件
  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  // 将 PDF 转换为图片
  const convertPdfToImages = async (file: File): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    
    // 确保在浏览器环境
    if (typeof window === "undefined") {
      return attachments;
    }
    
    try {
      // 延迟加载 pdfjs-dist
      if (!pdfjsLib) {
        const pdfjs = await import("pdfjs-dist");
        // 使用 CDN 指定版本
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;
        pdfjsLib = pdfjs;
      }
      
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
        cMapPacked: true,
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2; // 提高清晰度
        const viewport = page.getViewport({ scale });
        
        // 创建 canvas
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // 渲染 PDF 页面
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
        
        // 转换为 base64
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        
        const pageName = numPages > 1 
          ? `${file.name} (第${i}页/${numPages}页)` 
          : file.name;
        
        attachments.push({
          id: `${file.name}_page_${i}_${Date.now()}`,
          type: "image",
          name: pageName,
          base64: base64,
          mimeType: "image/png",
          previewUrl: dataUrl,
        });
      }
      
      // 清理
      await pdf.destroy();
      
      return attachments;
    } catch (error) {
      console.error("PDF 转换失败:", error);
      return [];
    }
  };

  // 将 txt/md 文件转换为图片
  const convertTextToImage = async (file: File): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    
    if (typeof window === "undefined") {
      return attachments;
    }
    
    try {
      const text = await file.text();
      const lines = text.split('\n');
      const maxCharsPerLine = 80;
      const lineHeight = 28;
      const padding = 40;
      
      // 计算画布尺寸
      const wrappedLines: string[] = [];
      for (const line of lines) {
        if (line.length <= maxCharsPerLine) {
          wrappedLines.push(line);
        } else {
          // 按单词分割换行
          const words = line.split(' ');
          let currentLine = '';
          for (const word of words) {
            if ((currentLine + word).length <= maxCharsPerLine) {
              currentLine += (currentLine ? ' ' : '') + word;
            } else {
              if (currentLine) wrappedLines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) wrappedLines.push(currentLine);
        }
      }
      
      const canvasWidth = 900;
      const canvasHeight = wrappedLines.length * lineHeight + padding * 2 + 40;
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      canvas.width = canvasWidth;
      canvas.height = Math.max(canvasHeight, 200);
      
      // 背景
      context.fillStyle = "#1e1e2e";
      context.fillRect(0, 0, canvasWidth, canvas.height);
      
      // 标题
      context.fillStyle = "#4a9eff";
      context.font = "bold 18px 'Microsoft YaHei', sans-serif";
      context.fillText(`📄 ${file.name}`, padding, padding + 18);
      
      // 内容
      context.fillStyle = "#e0e0e0";
      context.font = "16px 'Consolas', 'Microsoft YaHei', monospace";
      
      wrappedLines.forEach((line, index) => {
        context.fillText(line, padding, padding + 40 + index * lineHeight);
      });
      
      const dataUrl = canvas.toDataURL("image/png");
      attachments.push({
        id: `${file.name}_${Date.now()}`,
        type: "image",
        name: file.name,
        base64: dataUrl.split(",")[1],
        mimeType: "image/png",
        previewUrl: dataUrl,
      });
      
      return attachments;
    } catch (error) {
      console.error("文本转换失败:", error);
      return [];
    }
  };

  // 将 Word 文档转换为图片（支持 .docx）
  const convertWordToImage = async (file: File): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    
    if (typeof window === "undefined") {
      return attachments;
    }
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 动态导入 mammoth
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;
      
      // 创建临时容器渲染 HTML
      const container = document.createElement("div");
      container.innerHTML = html;
      container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        width: 800px;
        background: #1e1e2e;
        color: #e0e0e0;
        font-family: 'Microsoft YaHei', sans-serif;
        font-size: 14px;
        padding: 40px;
        line-height: 1.8;
      `;
      document.body.appendChild(container);
      
      // 等待内容渲染
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 分页处理（每页约 800px 高）
      const pageHeight = 1000;
      const totalHeight = container.scrollHeight;
      const numPages = Math.ceil(totalHeight / pageHeight) || 1;
      
      for (let i = 0; i < numPages; i++) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = 880;
        canvas.height = 1100;
        
        // 白色背景
        context.fillStyle = "#1e1e2e";
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // 标题
        context.fillStyle = "#4a9eff";
        context.font = "bold 20px 'Microsoft YaHei', sans-serif";
        context.fillText(`📝 ${file.name}`, 40, 50);
        
        // 创建临时 div 放置截取的内容
        const tempDiv = document.createElement("div");
        tempDiv.style.cssText = `
          position: absolute;
          left: -9999px;
          top: ${-i * pageHeight}px;
          width: 800px;
          background: #1e1e2e;
          color: #e0e0e0;
          font-family: 'Microsoft YaHei', sans-serif;
          font-size: 14px;
          padding: 20px;
        `;
        tempDiv.innerHTML = container.innerHTML;
        document.body.appendChild(tempDiv);
        
        // 转换为图片
        const blob = await htmlToBlob(tempDiv.innerHTML);
        const dataUrl = await new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            context.drawImage(img, 40, 80, 800, pageHeight);
            URL.revokeObjectURL(img.src);
            resolve(canvas.toDataURL("image/png"));
          };
          img.src = URL.createObjectURL(blob);
        });
        
        document.body.removeChild(tempDiv);
        
        const pageName = numPages > 1 
          ? `${file.name} (第${i + 1}页/${numPages}页)` 
          : file.name;
        
        attachments.push({
          id: `${file.name}_${i}_${Date.now()}`,
          type: "image",
          name: pageName,
          base64: dataUrl.split(",")[1],
          mimeType: "image/png",
          previewUrl: dataUrl,
        });
      }
      
      document.body.removeChild(container);
      return attachments;
    } catch (error) {
      console.error("Word 转换失败:", error);
      return [];
    }
  };

  // HTML 转 Blob
  const htmlToBlob = async (html: string): Promise<Blob> => {
    const css = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          background: #1e1e2e; 
          color: #e0e0e0; 
          font-family: 'Microsoft YaHei', sans-serif;
          font-size: 14px;
          padding: 20px;
          line-height: 1.8;
        }
        h1 { font-size: 24px; color: #4a9eff; margin-bottom: 16px; }
        h2 { font-size: 20px; color: #6ab7ff; margin: 16px 0; }
        h3 { font-size: 16px; color: #8cc8ff; margin: 12px 0; }
        p { margin: 8px 0; }
        ul, ol { margin: 8px 0 8px 24px; }
        li { margin: 4px 0; }
        code { background: #2a2a3e; padding: 2px 6px; border-radius: 4px; }
        pre { background: #2a2a3e; padding: 16px; border-radius: 8px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; margin: 16px 0; }
        th, td { border: 1px solid #3a3a4e; padding: 8px 12px; }
        th { background: #2a2a3e; }
      </style>
    `;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${css}</head><body>${html}</body></html>`;
    return new Blob([fullHtml], { type: "text/html" });
  };

  // 将 Excel 文件转换为图片
  const convertExcelToImage = async (file: File): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    
    if (typeof window === "undefined") {
      return attachments;
    }
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 动态导入 xlsx
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      
      // 每个 sheet 转换为一页图片
      for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex++) {
        const sheetName = workbook.SheetNames[sheetIndex];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        if (data.length === 0) continue;
        
        // 表格样式配置
        const cellWidth = 120;
        const cellHeight = 32;
        const headerHeight = 36;
        const padding = 20;
        const maxColWidths: number[] = [];
        
        // 计算每列最大宽度
        for (const row of data) {
          row.forEach((cell, colIndex) => {
            const cellStr = String(cell ?? "");
            const width = Math.min(cellStr.length * 10 + 20, cellWidth);
            maxColWidths[colIndex] = Math.max(maxColWidths[colIndex] || 0, width);
          });
        }
        
        const totalCols = maxColWidths.length;
        const totalWidth = maxColWidths.reduce((a, b) => a + b, 0) + padding * 2;
        const totalHeight = data.length * cellHeight + headerHeight + padding * 2 + 60;
        
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d")!;
        canvas.width = Math.max(totalWidth, 400);
        canvas.height = Math.max(totalHeight, 200);
        
        // 背景
        context.fillStyle = "#1e1e2e";
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // 标题
        context.fillStyle = "#4a9eff";
        context.font = "bold 18px 'Microsoft YaHei', sans-serif";
        context.fillText(`📊 ${file.name} - ${sheetName}`, padding, padding + 18);
        
        // 表头背景
        let y = padding + 40 + headerHeight;
        context.fillStyle = "#2a3a5e";
        context.fillRect(padding, y, totalWidth - padding * 2, headerHeight);
        
        // 绘制表头
        context.fillStyle = "#ffffff";
        context.font = "bold 14px 'Microsoft YaHei', sans-serif";
        let x = padding;
        for (let colIndex = 0; colIndex < totalCols; colIndex++) {
          const colLetter = XLSX.utils.encode_col(colIndex);
          context.fillText(colLetter, x + 8, y + 24);
          x += maxColWidths[colIndex];
        }
        
        // 绘制数据
        context.font = "13px 'Consolas', 'Microsoft YaHei', sans-serif";
        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
          const row = data[rowIndex];
          y += cellHeight;
          x = padding;
          
          // 行背景色（斑马纹）
          if (rowIndex % 2 === 0) {
            context.fillStyle = "#252535";
            context.fillRect(padding, y, totalWidth - padding * 2, cellHeight);
          }
          
          // 单元格边框
          context.strokeStyle = "#3a3a4e";
          context.strokeRect(padding, y, totalWidth - padding * 2, cellHeight);
          
          for (let colIndex = 0; colIndex < totalCols; colIndex++) {
            const cellValue = row[colIndex] ?? "";
            const cellStr = String(cellValue);
            
            // 单元格值
            context.fillStyle = "#e0e0e0";
            context.fillText(truncateText(context, cellStr, maxColWidths[colIndex] - 16), x + 8, y + 21);
            
            // 列边框
            context.strokeStyle = "#3a3a4e";
            context.beginPath();
            context.moveTo(x + maxColWidths[colIndex], y);
            context.lineTo(x + maxColWidths[colIndex], y + cellHeight);
            context.stroke();
            
            x += maxColWidths[colIndex];
          }
        }
        
        const dataUrl = canvas.toDataURL("image/png");
        const pageName = workbook.SheetNames.length > 1 
          ? `${file.name} - ${sheetName}` 
          : file.name;
        
        attachments.push({
          id: `${file.name}_${sheetIndex}_${Date.now()}`,
          type: "image",
          name: pageName,
          base64: dataUrl.split(",")[1],
          mimeType: "image/png",
          previewUrl: dataUrl,
        });
      }
      
      return attachments;
    } catch (error) {
      console.error("Excel 转换失败:", error);
      return [];
    }
  };

  // 截断文本以适应单元格宽度
  const truncateText = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
    const metrics = context.measureText(text);
    if (metrics.width <= maxWidth) return text;
    
    let truncated = text;
    while (context.measureText(truncated + "...").width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + "...";
  };

  // 解析输入中的 @image:xxx 格式引用，并转换为 {{img:N}} 标记
  const parseImageRefs = (text: string, attachmentMap: Map<string, Attachment>): { text: string; imageRefs: Attachment[] } => {
    const imageRefs: Attachment[] = [];
    
    // 匹配 @image:xxx 格式（支持中文文件名）
    const regex = /@image:([^\s]+)/g;
    let match;
    let lastIndex = 0;
    let newText = "";
    
    while ((match = regex.exec(text)) !== null) {
      // 添加图片标记之前的文本
      newText += text.slice(lastIndex, match.index);
      
      const refId = match[1];
      const found = attachmentMap.get(refId) || 
                    attachmentMap.get(refId.replace(/\.[^.]+$/, "")) ||
                    Array.from(attachmentMap.values()).find(a => 
                      a.name === refId || 
                      a.name.replace(/\.[^.]+$/, "") === refId.replace(/\.[^.]+$/, "") ||
                      a.name.toLowerCase().includes(refId.toLowerCase())
                    );
      
      if (found && !imageRefs.find(a => a.id === found.id)) {
        // 替换为 {{img:N}} 标记
        newText += `{{img:${imageRefs.length}}}`;
        imageRefs.push(found);
      } else {
        // 保留原始引用
        newText += match[0];
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // 添加剩余文本
    newText += text.slice(lastIndex);
    
    return { text: newText, imageRefs };
  };

  // 根据 refId 查找附件（搜索所有历史消息和当前附件）
  const findAttachmentByRef = (refId: string): Attachment | undefined => {
    // 合并历史消息附件和当前附件
    const allAttachments: Attachment[] = [
      ...attachments,
      ...messages.flatMap(m => m.attachments || [])
    ];
    
    // 支持模糊匹配（去掉扩展名匹配）
    const baseName = refId.replace(/\.[^.]+$/, "");
    return allAttachments.find(att => 
      att.name === refId || 
      att.name.replace(/\.[^.]+$/, "") === baseName ||
      att.name.toLowerCase().includes(baseName.toLowerCase())
    );
  };

  // 获取所有可用的图片名称（用于提示）
  const getAvailableImageNames = (): string[] => {
    const names = new Set<string>();
    // 当前上传的附件
    attachments.forEach(att => names.add(att.name));
    // 历史消息中的附件
    messages.forEach(m => {
      m.attachments?.forEach(att => names.add(att.name));
    });
    return Array.from(names);
  };

  // 发送消息
  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    // 构建附件映射（包含当前附件 + 历史消息附件）
    const attachmentMap = new Map<string, Attachment>();
    attachments.forEach(att => attachmentMap.set(att.name, att));
    messages.forEach(m => {
      m.attachments?.forEach(att => attachmentMap.set(att.name, att));
    });

    // 解析输入中的 @image:xxx 引用，转换为 {{img:N}} 标记
    const { text: processedText, imageRefs: refAttachments } = parseImageRefs(input, attachmentMap);
    
    // 收集所有图片附件（当前上传的 + @image: 引用的）
    const allAttachments: Attachment[] = [...attachments];
    
    // 添加通过 @image: 引用的图片
    for (const found of refAttachments) {
      if (!allAttachments.find(a => a.id === found.id)) {
        allAttachments.push(found);
      }
    }

    // 如果文本和附件都为空，不发送
    if (!processedText.trim() && allAttachments.length === 0) return;

    // 自动在开头插入所有图片的 {{img:N}} 标记（如果没有的话）
    let finalText = processedText;
    const hasImgMarkers = /\{\{img:\d+\}\}/.test(processedText);
    if (allAttachments.filter(a => a.type === "image").length > 0 && !hasImgMarkers && !processedText.trim()) {
      // 如果只有图片没有文字，自动添加所有图片标记
      finalText = allAttachments
        .map((att, idx) => att.type === "image" ? `{{img:${idx}}}` : null)
        .filter(Boolean)
        .join("\n");
    } else if (allAttachments.filter(a => a.type === "image").length > 0 && !hasImgMarkers && processedText.trim()) {
      // 如果有文字，自动在开头插入所有图片
      const imgMarkers = allAttachments
        .map((att, idx) => att.type === "image" ? `{{img:${idx}}}` : null)
        .filter(Boolean)
        .join("\n");
      finalText = imgMarkers + "\n" + processedText;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: finalText,
      attachments: allAttachments,
      timestamp: new Date(),
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    try {
      // 构建所有消息的内容（支持多模态）
      const processedMessages = allMessages.map((m) => {
        // 如果是用户消息且有附件，构建多模态内容
        if (m.role === "user" && m.attachments?.length) {
          const contentParts: any[] = [];
          
          // 添加图片附件
          for (const att of m.attachments) {
            if (att.type === "image") {
              contentParts.push({
                type: "image_url",
                image_url: {
                  url: `data:${att.mimeType};base64,${att.base64}`,
                },
              });
            }
          }
          
          // 添加文本内容
          if (m.content) {
            contentParts.push({
              type: "text",
              text: m.content,
            });
          }
          
          return { role: m.role, content: contentParts };
        }
        
        // AI 消息或其他情况，直接返回文本内容
        return { role: m.role, content: m.content };
      });

      // 创建 AbortController 用于停止
      abortControllerRef.current = new AbortController();

      // 流式响应处理
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: processedMessages,
          model: selectedModel,
          temperature: temperature,
          max_tokens: maxTokens,
          top_p: topP,
          top_k: topK,
          frequency_penalty: frequencyPenalty,
          enable_thinking: enableThinking,
          thinking_budget: thinkingBudget,
          stop: stopSequences ? stopSequences.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        let errorMessage = "API request failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.error || errorData.detail || errorData.message || `Error ${response.status}`;
        } catch {
          errorMessage = `Error ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      // 创建空消息占位
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
    setMessages((prev) => [...prev, assistantMessage]);

    // 流式读取响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
      let fullContent = "";
      let reasoningContent = "";

      if (!reader) {
        throw new Error("无法读取响应流");
      }

      try {
        while (true) {
          let value;
          try {
            const result = await reader.read();
            value = result.value;
            if (result.done) break;
          } catch (readError: any) {
            // 如果是 abort 请求，退出循环
            if (readError.name === 'AbortError') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId 
                    ? { ...m, content: m.content + "\n\n*[已停止生成]*" }
                    : m
                )
              );
              break;
            }
            throw readError;
          }

          let chunk = "";
          try {
            // 安全解码：过滤掉可能导致问题的字符
            const uint8Array = new Uint8Array(value);
            const rawText = decoder.decode(uint8Array, { stream: true });
            // 过滤所有控制字符和 BOM
            chunk = rawText.replace(/[\u0000-\u001F\uFEFF]/g, "");
          } catch (decodeError) {
            console.warn("Decode warning:", decodeError);
            continue;
          }
          
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                // 过滤 BOM 和其他控制字符
                const cleanData = data.replace(/[\u0000-\u001F\uFEFF]/g, "");
                if (!cleanData.trim()) continue;
                
                const parsed = JSON.parse(cleanData);
                const delta = parsed.choices?.[0]?.delta;
                
                if (delta?.content) {
                  fullContent += delta.content;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId ? { ...m, content: fullContent } : m
                    )
                  );
                }
                
                // 处理思维模式
                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content;
                }
              } catch (e) {
                // 静默忽略解析错误，继续处理下一行
              }
            }
          }
        }
      } catch (streamError) {
        console.warn("Stream read warning:", streamError);
      } finally {
        try { reader.releaseLock(); } catch (e) {}
      }

      // 如果有思维内容，更新消息
      if (reasoningContent) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, reasoning: reasoningContent } : m
          )
        );
      }
    } catch (error) {
      console.error("Chat error:", error);
      // 不显示错误消息到界面，只记录日志
    } finally {
      setIsLoading(false);
    }
  };

  // 处理快捷按钮
  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  // 处理回车发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清空对话
  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen" style={{ 
      background: "linear-gradient(180deg, #0a0a0f 0%, #0d0d1a 50%, #0a0a0f 100%)",
      backgroundAttachment: "fixed"
    }}>
      {/* 赛博朋克网格背景 */}
      <div className="fixed inset-0 pointer-events-none opacity-20" style={{
        backgroundImage: `
          linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: "50px 50px",
      }} />
      
      {/* 顶部栏 - 霓虹风格 */}
      <header className="relative flex items-center justify-between px-6 py-4 border-b backdrop-blur-md" style={{ 
        borderColor: "rgba(255, 0, 128, 0.3)",
        background: "rgba(10, 10, 15, 0.8)"
      }}>
        {/* 霓虹发光装饰线 */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, #ff0080, #00ffff, #ff0080, transparent)"
        }} />
        
        <div className="flex items-center gap-4">
          {/* Logo - 霓虹发光效果 */}
          <div className="relative">
            <div className="absolute inset-0 blur-xl" style={{ background: "linear-gradient(135deg, #ff0080, #00ffff)", opacity: 0.5 }} />
            <div className="relative w-12 h-12 rounded-lg flex items-center justify-center" 
                 style={{ 
                   background: "linear-gradient(135deg, #ff0080, #00ffff)",
                   boxShadow: "0 0 30px rgba(255, 0, 128, 0.5), 0 0 60px rgba(0, 255, 255, 0.3)"
                 }}>
              <span className="text-white text-xl font-bold tracking-wider">K</span>
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-wider" style={{ 
            color: "#00ffff",
            textShadow: "0 0 10px rgba(0, 255, 255, 0.5)"
          }}>KIMI CYBER</h1>
          <span className="text-xs px-2 py-1 rounded" style={{ 
            background: "rgba(255, 0, 128, 0.2)", 
            color: "#ff0080",
            border: "1px solid rgba(255, 0, 128, 0.3)"
          }}>NEON MODE</span>
        </div>

        {/* 模型选择和设置 */}
        <div className="flex items-center gap-3">
          {/* 模型选择 - 霓虹边框 */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="px-4 py-2 rounded-lg text-sm font-medium outline-none cursor-pointer backdrop-blur-md transition-all hover:scale-105"
            style={{ 
              background: "rgba(10, 10, 15, 0.8)", 
              color: "#00ffff",
              border: "1px solid rgba(0, 255, 255, 0.5)",
              boxShadow: "0 0 10px rgba(0, 255, 255, 0.2)"
            }}
          >
            {VISION_MODELS.map((model) => (
              <option key={model.id} value={model.id} style={{ background: "#0a0a0f", color: "#00ffff" }}>
                {model.name}
              </option>
            ))}
          </select>

          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-110"
            style={{ 
              background: showSettings ? "rgba(255, 0, 128, 0.3)" : "rgba(10, 10, 15, 0.8)",
              border: showSettings ? "1px solid #ff0080" : "1px solid rgba(0, 255, 255, 0.3)",
              color: showSettings ? "#ff0080" : "#00ffff",
              boxShadow: showSettings ? "0 0 15px rgba(255, 0, 128, 0.4)" : "0 0 10px rgba(0, 255, 255, 0.2)"
            }}
            title="高级设置"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* 新对话按钮 */}
          <button
            onClick={handleClear}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-110"
            style={{ 
              background: "rgba(10, 10, 15, 0.8)",
              border: "1px solid rgba(0, 255, 255, 0.3)",
              color: "#00ffff",
              boxShadow: "0 0 10px rgba(0, 255, 255, 0.2)"
            }}
            title="新对话"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </header>

      {/* 高级设置面板 - 霓虹边框 */}
      {showSettings && (
        <div className="relative px-6 py-4 border-b backdrop-blur-md" style={{ 
          borderColor: "rgba(255, 0, 255, 0.3)",
          background: "rgba(10, 10, 15, 0.8)"
        }}>
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{
            background: "linear-gradient(90deg, transparent, #ff00ff, #ff0080, transparent)"
          }} />
          <div className="max-w-3xl mx-auto">
            <h3 className="text-sm font-bold mb-3 tracking-wider" style={{ color: "#ff00ff" }}>高级参数</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Temperature */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  Temperature: {temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer"
                  style={{ accentColor: "#ff00ff" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                  <span>精确</span>
                  <span>随机</span>
                </div>
              </div>

              {/* Top P */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  Top P: {topP}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer"
                  style={{ accentColor: "#00ffff" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                  <span>集中</span>
                  <span>多样</span>
                </div>
              </div>

              {/* Top K */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  Top K: {topK}
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer"
                  style={{ accentColor: "#ff0080" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                  <span>1</span>
                  <span>100</span>
                </div>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  Max Tokens: {maxTokens}
                </label>
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer"
                  style={{ accentColor: "#00ffff" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                  <span>256</span>
                  <span>8192</span>
                </div>
              </div>

              {/* Frequency Penalty */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  Frequency Penalty: {frequencyPenalty}
                </label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={frequencyPenalty}
                  onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg cursor-pointer"
                  style={{ accentColor: "#ff0080" }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                  <span>重复</span>
                  <span>新颖</span>
                </div>
              </div>

              {/* Enable Thinking */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  思维模式 (Thinking)
                </label>
                <button
                  onClick={() => setEnableThinking(!enableThinking)}
                  className="w-full py-2 px-3 rounded-lg text-sm transition font-medium"
                  style={{ 
                    background: enableThinking ? "rgba(255, 0, 255, 0.3)" : "rgba(10, 10, 15, 0.8)",
                    color: enableThinking ? "#ff00ff" : "rgba(0, 255, 255, 0.6)",
                    border: enableThinking ? "1px solid #ff00ff" : "1px solid rgba(255, 0, 255, 0.3)",
                    boxShadow: enableThinking ? "0 0 15px rgba(255, 0, 255, 0.4)" : "none"
                  }}
                >
                  {enableThinking ? "✅ 开启" : "❌ 关闭"}
                </button>
              </div>

              {/* Thinking Budget */}
              {enableThinking && (
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                    思维预算: {thinkingBudget}
                  </label>
                  <input
                    type="range"
                    min="128"
                    max="8192"
                    step="128"
                    value={thinkingBudget}
                    onChange={(e) => setThinkingBudget(parseInt(e.target.value))}
                    className="w-full h-2 rounded-lg cursor-pointer"
                    style={{ accentColor: "#ff00ff" }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(0, 255, 255, 0.6)" }}>
                    <span>128</span>
                    <span>8192</span>
                  </div>
                </div>
              )}

              {/* Stop Sequences */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "rgba(255, 0, 255, 0.8)" }}>
                  停止序列
                </label>
                <input
                  type="text"
                  value={stopSequences}
                  onChange={(e) => setStopSequences(e.target.value)}
                  placeholder="用,分隔"
                  className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                  style={{ 
                    background: "rgba(10, 10, 15, 0.8)", 
                    color: "#00ffff",
                    border: "1px solid rgba(0, 255, 255, 0.3)"
                  }}
                />
              </div>
            </div>

            {/* 支持思维模式的模型提示 */}
            <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ 
              background: "rgba(255, 0, 255, 0.1)", 
              border: "1px solid rgba(255, 0, 255, 0.3)",
              color: "rgba(0, 255, 255, 0.8)"
            }}>
              <span style={{ color: "#ff00ff" }}>💡 思维模式支持：</span>
              <span style={{ color: "rgba(0, 255, 255, 0.6)" }}>GLM-5.1V、DeepSeek-V3.2、Qwen3 系列</span>
            </div>
          </div>
        </div>
      )}

      {/* 消息区域 */}
      <main className="flex-1 overflow-y-auto p-6 relative">
        {messages.length === 0 ? (
          /* 欢迎页面 - 霓虹风格 */
          <div className="flex flex-col items-center justify-center h-full">
            {/* Logo 大图标 - 霓虹发光 */}
            <div className="relative mb-8">
              <div className="absolute inset-0 blur-3xl animate-pulse" style={{ background: "linear-gradient(135deg, #ff0080, #00ffff)", opacity: 0.4 }} />
              <div className="relative w-24 h-24 rounded-2xl flex items-center justify-center"
                   style={{ 
                     background: "linear-gradient(135deg, #ff0080, #00ffff)",
                     boxShadow: "0 0 50px rgba(255, 0, 128, 0.5), 0 0 100px rgba(0, 255, 255, 0.3)"
                   }}>
                <span className="text-white text-5xl font-bold tracking-wider">K</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2 tracking-wider" style={{ 
              color: "#00ffff",
              textShadow: "0 0 20px rgba(0, 255, 255, 0.5)"
            }}>你好，我是 KIMI</h2>
            <p className="mb-4 text-center max-w-md" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
              赛博朋克模式 · 多模态理解 · 霓虹未来
            </p>

            {/* 当前模型 */}
            <div className="mb-6 px-4 py-2 rounded-lg text-sm" style={{ 
              background: "rgba(10, 10, 15, 0.8)",
              border: "1px solid rgba(255, 0, 128, 0.3)",
              color: "#ff0080",
              boxShadow: "0 0 15px rgba(255, 0, 128, 0.2)"
            }}>
              <span style={{ color: "rgba(255, 255, 255, 0.5)" }}>当前模型: </span>
              <span className="font-bold" style={{ color: "#ff0080" }}>
                {VISION_MODELS.find(m => m.id === selectedModel)?.name}
              </span>
            </div>

            {/* 快捷按钮 - 霓虹边框 */}
            <div className="flex flex-wrap gap-3 justify-center max-w-xl mb-6">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.prompt)}
                  className="px-4 py-2.5 rounded-lg text-sm transition-all hover:scale-105 hover:shadow-lg"
                  style={{ 
                    background: "rgba(10, 10, 15, 0.8)",
                    border: "1px solid rgba(0, 255, 255, 0.3)",
                    color: "#00ffff",
                    boxShadow: "0 0 10px rgba(0, 255, 255, 0.2)"
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>

            {/* 功能说明 - 霓虹卡片 */}
            <div className="grid grid-cols-4 gap-4 max-w-2xl text-center">
              <div className="p-4 rounded-lg backdrop-blur-md" style={{ 
                background: "rgba(10, 10, 15, 0.6)",
                border: "1px solid rgba(0, 255, 255, 0.2)"
              }}>
                <div className="text-2xl mb-2">🖼️</div>
                <div className="text-sm" style={{ color: "rgba(0, 255, 255, 0.8)" }}>图片上传</div>
              </div>
              <div className="p-4 rounded-lg backdrop-blur-md" style={{ 
                background: "rgba(10, 10, 15, 0.6)",
                border: "1px solid rgba(255, 0, 255, 0.2)"
              }}>
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm" style={{ color: "rgba(255, 0, 255, 0.8)" }}>Ctrl+V 粘贴</div>
              </div>
              <div className="p-4 rounded-lg backdrop-blur-md" style={{ 
                background: "rgba(10, 10, 15, 0.6)",
                border: "1px solid rgba(255, 0, 128, 0.2)"
              }}>
                <div className="text-2xl mb-2">📄</div>
                <div className="text-sm" style={{ color: "rgba(255, 0, 128, 0.8)" }}>文档转换</div>
              </div>
              <div className="p-4 rounded-lg backdrop-blur-md" style={{ 
                background: "rgba(10, 10, 15, 0.6)",
                border: "1px solid rgba(0, 255, 255, 0.2)"
              }}>
                <div className="text-2xl mb-2">💡</div>
                <div className="text-sm" style={{ color: "rgba(0, 255, 255, 0.8)" }}>智能助手</div>
              </div>
            </div>
          </div>
        ) : (
          /* 消息列表 - 霓虹风格 */
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {/* AI 头像 - 霓虹发光 */}
                {message.role === "assistant" && (
                  <div className="relative flex-shrink-0">
                    <div className="absolute inset-0 blur-md" style={{ background: "#ff0080", opacity: 0.4 }} />
                    <div className="relative w-10 h-10 rounded-lg flex items-center justify-center"
                         style={{ 
                           background: "linear-gradient(135deg, #ff0080, #00ffff)",
                           boxShadow: "0 0 20px rgba(255, 0, 128, 0.5)"
                         }}>
                      <span className="text-white text-lg font-bold">K</span>
                    </div>
                  </div>
                )}

                {/* 消息内容 */}
                <div className="max-w-2xl">
                  {/* 非图片附件预览 - 霓虹边框（只显示文件类型附件） */}
                  {message.attachments && message.attachments.filter(a => a.type !== "image").length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {message.attachments.filter(a => a.type !== "image").map((att) => (
                        <div key={att.id} className="relative rounded-lg overflow-hidden px-3 py-2" style={{ 
                          background: "rgba(10, 10, 15, 0.8)",
                          border: "1px solid rgba(0, 255, 255, 0.3)",
                          boxShadow: "0 0 15px rgba(0, 255, 255, 0.2)"
                        }}>
                          <div className="flex items-center gap-2">
                            <span className="text-xl">📄</span>
                            <span className="text-sm max-w-32 truncate" style={{ color: "#00ffff" }}>{att.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 文本内容 - 霓虹气泡（图文混排） */}
                  <div className={`px-5 py-3.5 rounded-lg backdrop-blur-md ${
                    message.role === "user" ? "rounded-tr-none" : "rounded-tl-none"
                  }`} style={{
                    background: message.role === "user" 
                      ? "linear-gradient(135deg, rgba(255, 0, 128, 0.3), rgba(255, 0, 255, 0.2))"
                      : "rgba(10, 10, 15, 0.8)",
                    border: message.role === "user"
                      ? "1px solid rgba(255, 0, 128, 0.5)"
                      : "1px solid rgba(0, 255, 255, 0.3)",
                    boxShadow: message.role === "user"
                      ? "0 0 20px rgba(255, 0, 128, 0.3)"
                      : "0 0 20px rgba(0, 255, 255, 0.2)"
                  }}>
                    {/* 思维模式推理内容 */}
                    {message.reasoning && (
                      <div className="mb-3 pb-3" style={{ borderBottom: "1px solid rgba(255, 0, 255, 0.3)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ 
                            background: "rgba(255, 0, 255, 0.2)",
                            color: "#ff00ff",
                            border: "1px solid rgba(255, 0, 255, 0.3)"
                          }}>
                            🧠 思考中
                          </span>
                        </div>
                        <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                          {message.reasoning}
                        </div>
                      </div>
                    )}
                    {/* 图文混排渲染 */}
                    <div className="whitespace-pre-wrap break-words leading-relaxed" style={{ 
                      color: message.role === "user" ? "#ffffff" : "rgba(255, 255, 255, 0.9)",
                      lineHeight: "1.8"
                    }}>
                      {renderContentWithImages(
                        message.content || (message.role === "assistant" ? "思考中..." : ""),
                        message.attachments
                      )}
                    </div>
                  </div>

                  {/* 用户头像 - 霓虹青色 */}
                  {message.role === "user" && (
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 blur-md" style={{ background: "#00ffff", opacity: 0.4 }} />
                        <div className="relative w-10 h-10 rounded-lg flex items-center justify-center"
                             style={{ 
                               background: "linear-gradient(135deg, #00ffff, #00ff88)",
                               boxShadow: "0 0 20px rgba(0, 255, 255, 0.5)"
                             }}>
                          <span className="text-white text-lg font-bold">U</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 加载中 - 霓虹动画 */}
            {isLoading && (
              <div className="flex gap-4 justify-start">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 blur-md" style={{ background: "#ff0080", opacity: 0.4 }} />
                  <div className="relative w-10 h-10 rounded-lg flex items-center justify-center"
                       style={{ 
                         background: "linear-gradient(135deg, #ff0080, #00ffff)",
                         boxShadow: "0 0 20px rgba(255, 0, 128, 0.5)"
                       }}>
                    <span className="text-white text-lg font-bold">K</span>
                  </div>
                </div>
                <div className="px-5 py-3.5 rounded-lg backdrop-blur-md" style={{ 
                  background: "rgba(10, 10, 15, 0.8)",
                  border: "1px solid rgba(0, 255, 255, 0.3)"
                }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "#ff0080", animationDelay: "0ms" }} />
                    <div className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "#00ffff", animationDelay: "150ms" }} />
                    <div className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: "#ff00ff", animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* 附件预览区域 - 霓虹风格 */}
      {attachments.length > 0 && (
        <div className="px-6 pb-2">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div key={att.id} className="relative group rounded-lg overflow-hidden" style={{ 
                background: "rgba(10, 10, 15, 0.8)",
                border: "1px solid rgba(0, 255, 255, 0.3)",
                boxShadow: "0 0 15px rgba(0, 255, 255, 0.2)"
              }}>
                {att.type === "image" && att.previewUrl && (
                  <img src={att.previewUrl} alt={att.name} className="w-16 h-16 object-cover" />
                )}
                {att.type === "file" && (
                  <div className="w-16 h-16 flex items-center justify-center">
                    <span className="text-2xl">📄</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  style={{ 
                    background: "#ff0080", 
                    color: "white",
                    boxShadow: "0 0 10px rgba(255, 0, 128, 0.5)"
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输入区域 - 霓虹风格 */}
      <footer className="relative p-6 backdrop-blur-md" style={{ 
        borderTop: "1px solid rgba(255, 0, 128, 0.3)",
        background: "rgba(10, 10, 15, 0.8)"
      }}>
        {/* 霓虹发光线 */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, #00ffff, #ff0080, #00ffff, transparent)"
        }} />
        
        <div className="max-w-4xl mx-auto">
          {/* 工具栏 */}
          <div className="flex items-center gap-2 mb-3">
            {/* 图片上传 */}
            <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
              style={{ 
                background: "rgba(10, 10, 15, 0.8)",
                border: "1px solid rgba(0, 255, 255, 0.3)",
                color: "#00ffff",
                boxShadow: "0 0 10px rgba(0, 255, 255, 0.2)"
              }}
              title="上传图片"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* 文件上传 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
              style={{ 
                background: "rgba(10, 10, 15, 0.8)",
                border: "1px solid rgba(255, 0, 255, 0.3)",
                color: "#ff00ff",
                boxShadow: "0 0 10px rgba(255, 0, 255, 0.2)"
              }}
              title="上传文件"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>

            {/* 快捷按钮 - 霓虹风格 */}
            <div className="flex items-center gap-1 ml-2">
              {QUICK_ACTIONS.slice(0, 4).map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all hover:scale-105 disabled:opacity-50"
                  style={{ 
                    background: "rgba(10, 10, 15, 0.8)",
                    border: "1px solid rgba(0, 255, 255, 0.3)",
                    color: "#00ffff"
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* 输入框 - 霓虹风格 */}
          <div className="relative flex items-end gap-3 p-4 rounded-lg backdrop-blur-md" style={{ 
            background: "rgba(10, 10, 15, 0.8)",
            border: "1px solid rgba(0, 255, 255, 0.3)",
            boxShadow: "0 0 20px rgba(0, 255, 255, 0.1)"
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，支持粘贴图片..."
              rows={1}
              className="flex-1 bg-transparent outline-none resize-none"
              style={{ 
                maxHeight: "150px",
                color: "rgba(255, 255, 255, 0.9)",
                caretColor: "#00ffff"
              }}
            />
            
            {/* 发送/停止按钮 - 霓虹发光 */}
            <button
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && !input.trim() && attachments.length === 0}
              className="relative w-12 h-12 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-110"
              style={{
                background: isLoading 
                  ? "linear-gradient(135deg, #ff0000, #ff4444)"  // 红色停止
                  : "linear-gradient(135deg, #ff0080, #00ffff)",
                boxShadow: isLoading 
                  ? "0 0 30px rgba(255, 0, 0, 0.5)"
                  : "0 0 30px rgba(255, 0, 128, 0.5), 0 0 60px rgba(0, 255, 255, 0.3)"
              }}
              title={isLoading ? "停止生成" : "发送消息"}
            >
              {isLoading ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-xs mt-3" style={{ 
            color: "rgba(0, 255, 255, 0.4)",
            textShadow: "0 0 10px rgba(0, 255, 255, 0.2)"
          }}>
            <span style={{ color: "#ff0080" }}>KIMI CYBER</span> · Ctrl+V 粘贴截图 · 支持 Markdown 代码高亮
          </p>
        </div>
      </footer>
    </div>
  );
}
