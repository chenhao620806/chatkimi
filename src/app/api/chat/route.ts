import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.SILICONFLOW_API_KEY;
const BASE_URL = "https://api.siliconflow.cn/v1";

// 支持的图片类型
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface MessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      messages, 
      model = "Pro/moonshotai/Kimi-K2.6",
      temperature,
      max_tokens,
      top_p,
      top_k,
      frequency_penalty,
      enable_thinking,
      thinking_budget,
      stop,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    if (!API_KEY) {
      console.error("SILICONFLOW_API_KEY environment variable is not set");
      return NextResponse.json(
        { error: "API key not configured. Please set SILICONFLOW_API_KEY in Vercel environment variables." },
        { status: 500 }
      );
    }

    // 处理消息 - 支持多模态内容
    const processedMessages = messages.map((msg: any) => {
      // 如果是数组格式（多模态消息），直接返回
      if (Array.isArray(msg.content)) {
        return msg;
      }
      // 如果是简单的文本消息，直接返回
      if (typeof msg.content === "string") {
        return msg;
      }
      return msg;
    });

    // 构建 API 请求参数
    const requestBody: any = {
      model: model,
      messages: processedMessages,
    };

    // 添加所有可选参数（强制流式输出）
    requestBody.stream = true;
    if (temperature !== undefined) requestBody.temperature = temperature;
    if (max_tokens !== undefined) requestBody.max_tokens = max_tokens;
    if (top_p !== undefined) requestBody.top_p = top_p;
    if (top_k !== undefined) requestBody.top_k = top_k;
    if (frequency_penalty !== undefined) requestBody.frequency_penalty = frequency_penalty;
    if (enable_thinking !== undefined) requestBody.enable_thinking = enable_thinking;
    if (thinking_budget !== undefined) requestBody.thinking_budget = thinking_budget;
    if (stop !== undefined) requestBody.stop = stop;

    // 调用硅基流动 API（流式输出）
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SiliconFlow API error:", response.status, errorText);
      return NextResponse.json(
        { error: `API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    // 直接返回原始流，避免编码转换导致的问题
    // 同时过滤掉响应中的 BOM 字符
    const transformStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 直接转发原始字节数据
            controller.enqueue(value);
          }
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          try { controller.close(); } catch (e) {}
        }
      },
    });

    return new Response(transformStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
