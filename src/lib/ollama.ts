// کلاینت Ollama با پشتیبانی استریم، تفکر (thinking) و تصویر

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 بدون پیشوند data:
}

export interface ChatChunk {
  thinkingDelta?: string;
  contentDelta?: string;
  done?: boolean;
  error?: string;
}

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 600000);

export async function listModels(): Promise<{ ok: boolean; models: { name: string; size: number }[]; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string; size: number }[] };
    return {
      ok: true,
      models: (data.models || []).map((m) => ({ name: m.name, size: m.size })),
    };
  } catch (e) {
    return {
      ok: false,
      models: [],
      error: e instanceof Error ? e.message : 'اتصال به Ollama برقرار نشد',
    };
  }
}

/**
 * استریم چت از Ollama. تفکر را از دو منبع ممکن استخراج می‌کند:
 * ۱) فیلد message.thinking در نسخه‌های جدید Ollama
 * ۲) تگ‌های <think>...</think> داخل content (نسخه‌های قدیمی‌تر / حالت پیش‌فرض qwen3)
 */
export async function* streamOllamaChat(
  model: string,
  messages: OllamaMessage[],
  options?: { temperature?: number }
): AsyncGenerator<ChatChunk> {
  const body = {
    model,
    messages,
    stream: true,
    think: true,
    options: {
      temperature: options?.temperature ?? 0.7,
      num_ctx: Number(process.env.OLLAMA_NUM_CTX || 8192),
    },
  };

  let res: Response | null = null;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // اگر نسخه Ollama پارامتر think را نمی‌شناسد یا مدل از تفکر پشتیبانی نمی‌کند
    if (res.status === 400) {
      res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, think: undefined }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
  } catch (e) {
    yield { error: `اتصال به Ollama (${OLLAMA_BASE_URL}) برقرار نشد. آیا سرویس Ollama در حال اجراست؟` };
    return;
  }

  if (!res || !res.ok || !res.body) {
    let detail = '';
    try {
      detail = res ? (await res.text()).slice(0, 300) : '';
    } catch { /* ignore */ }
    yield { error: `خطای Ollama: ${res ? `HTTP ${res.status}` : 'بدون پاسخ'} ${detail}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { stream: true });
  let buffer = '';

  // پارسر تگ <think> به‌صورت افزایشی
  let insideThink = false;
  let carry = '';

  const processDelta = function* (piece: string): Generator<ChatChunk> {
    let text = carry + piece;
    carry = '';
    while (text.length > 0) {
      if (insideThink) {
        const end = text.indexOf('</think>');
        if (end !== -1) {
          if (end > 0) yield { thinkingDelta: text.slice(0, end) };
          text = text.slice(end + 8);
          insideThink = false;
        } else {
          // نگه‌داشتن دنباله‌ای که ممکن است بخشی از تگ باشد
          const keep = Math.min(text.length, 7);
          if (text.length > keep) yield { thinkingDelta: text.slice(0, text.length - keep) };
          carry = text.slice(Math.max(0, text.length - keep));
          return;
        }
      } else {
        const start = text.indexOf('<think>');
        if (start !== -1) {
          if (start > 0) yield { contentDelta: text.slice(0, start) };
          text = text.slice(start + 7);
          insideThink = true;
        } else {
          const keep = Math.min(text.length, 6);
          if (text.length > keep) yield { contentDelta: text.slice(0, text.length - keep) };
          carry = text.slice(Math.max(0, text.length - keep));
          return;
        }
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: {
          message?: { content?: string; thinking?: string };
          done?: boolean;
          error?: string;
        };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (parsed.error) {
          yield { error: parsed.error };
          return;
        }
        // حالت ۱: فیلد thinking مستقل (Ollama جدید)
        if (parsed.message?.thinking) {
          yield { thinkingDelta: parsed.message.thinking };
        }
        const content = parsed.message?.content;
        if (content) {
          // حالت ۲: تگ <think> داخل content
          yield* processDelta(content);
        }
        if (parsed.done) {
          if (carry) {
            yield insideThink ? { thinkingDelta: carry } : { contentDelta: carry };
            carry = '';
          }
          yield { done: true };
          return;
        }
      }
    }
    if (carry) {
      yield insideThink ? { thinkingDelta: carry } : { contentDelta: carry };
    }
    yield { done: true };
  } catch (e) {
    yield { error: e instanceof Error ? `قطع‌شدن جریان پاسخ: ${e.message}` : 'خطای ناشناخته در دریافت پاسخ' };
  }
}

// حالت آزمایشی بدون Ollama (برای تست رابط کاربری)
export async function* streamMockChat(userMessage: string): AsyncGenerator<ChatChunk> {
  const thinking =
    `کاربر پرسیده: «${userMessage}». باید پاسخ را بر اساس پایگاه دانش کمیته امداد و اطلاعات موجود بررسی کنم. ` +
    `این یک پاسخ آزمایشی است چون Ollama در دسترس نیست؛ برای پاسخ واقعی باید سرویس Ollama روی سرور اجرا شود. `;
  const words = thinking.split(' ');
  for (const w of words) {
    yield { thinkingDelta: w + ' ' };
    await new Promise((r) => setTimeout(r, 30));
  }
  const answer =
    `سلام! این یک **پاسخ آزمایشی** است.\n\n` +
    `پیام شما: «${userMessage}»\n\n` +
    `در حال حاضر سرور Ollama در دسترس نیست، بنابراین این پاسخ صرفاً برای نمایش عملکرد رابط کاربری تولید شده است. ` +
    `برای فعال‌سازی پاسخ‌گویی واقعی:\n\n` +
    `1. اجرای سرویس Ollama روی سرور\n` +
    `2. تنظیم آدرس آن در متغیر محیطی \`OLLAMA_BASE_URL\`\n` +
    `3. بارگذاری مدل‌های qwen3:8b یا qwen3:4b\n\n` +
    `پس از آن، این دستیار به سؤالات مربوط به برنامه پنج‌ساله هفتم، دستورالعمل پذیرش، سامانه شفافیت، آمار و عملکرد و میز خدمت کمیته امداد پاسخ خواهد داد.`;
  const tokens = answer.split(/(\s+)/);
  for (const t of tokens) {
    yield { contentDelta: t };
    await new Promise((r) => setTimeout(r, 15));
  }
  yield { done: true };
}

export function getOllamaBaseUrl(): string {
  return OLLAMA_BASE_URL;
}
