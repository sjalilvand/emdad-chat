// کلاینت Ollama با پشتیبانی استریم، تفکر (thinking) و تصویر
// نکته فنی: برای استریم چت از node:http استفاده می‌شود (نه fetch)؛
// چون fetch/undici سقف ۵ دقیقه‌ای برای هدر پاسخ دارد و در بارگذاری طولانی
// مدل‌های بزرگ (مثل qwen3:8b روی سرور کم‌رم) باعث خطای کاذب «اتصال برقرار نشد» می‌شود.

import http from 'http';
import https from 'https';

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

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 600000);
const THINK_ENABLED = process.env.OLLAMA_THINK !== '0';
const NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 0);
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '30m';

/** زنجیره علت خطا را برای عیب‌یابی برمی‌گرداند (مثلاً ECONNRESET / ENOMEM / Timeout) */
function describeError(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  let depth = 0;
  while (cur && depth < 5) {
    if (cur instanceof Error) {
      const code = (cur as NodeJS.ErrnoException).code;
      parts.push(code ? `${cur.message} [${code}]` : cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === 'string') {
      parts.push(cur);
      break;
    } else {
      break;
    }
    depth++;
  }
  return parts.join(' ← ') || 'خطای ناشناخته';
}

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

// ------------------------------------------------------------------
// درخواست POST با node:http — بدون سقف هدر undici
// req.setTimeout فقط «بی‌کاری سوکت» را می‌سنجد و با هر داده receiving ریست می‌شود
// ------------------------------------------------------------------

interface PostResult {
  status: number;
  res: http.IncomingMessage;
}

function postStream(urlStr: string, payload: string, timeoutMs: number): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => resolve({ status: res.statusCode || 0, res })
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        Object.assign(new Error(`مهلت درخواست به Ollama تمام شد (${Math.round(timeoutMs / 1000)} ثانیه)`), {
          code: 'OLLAMA_TIMEOUT',
        })
      );
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function readAll(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    res.setEncoding('utf-8');
    res.on('data', (c: string) => {
      data += c;
    });
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}

/** تبدیل پاسخ NDJSON ورودی به خط‌های JSON */
async function* ndjsonLines(res: http.IncomingMessage): AsyncGenerator<string> {
  const queue: (string | null)[] = [];
  let notify: (() => void) | null = null;
  let failed: unknown = null;
  res.setEncoding('utf-8');
  const push = (item: string | null) => {
    queue.push(item);
    if (notify) {
      const n = notify;
      notify = null;
      n();
    }
  };
  res.on('data', (c: string) => push(c));
  res.on('end', () => push(null));
  res.on('error', (err: Error) => {
    failed = err;
    push(null);
  });

  let buffer = '';
  for (;;) {
    if (queue.length === 0) {
      await new Promise<void>((r) => {
        notify = r;
      });
      continue;
    }
    const item = queue.shift()!;
    if (item === null) {
      if (buffer.trim()) yield buffer;
      if (failed) throw failed;
      return;
    }
    buffer += item;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (t) yield t;
    }
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
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    keep_alive: KEEP_ALIVE,
    options: {
      temperature: options?.temperature ?? 0.7,
      num_ctx: Number(process.env.OLLAMA_NUM_CTX || 8192),
      ...(NUM_PREDICT > 0 ? { num_predict: NUM_PREDICT } : {}),
    },
  };
  if (THINK_ENABLED) body.think = true;

  let attempt: PostResult;
  try {
    attempt = await postStream(`${OLLAMA_BASE_URL}/api/chat`, JSON.stringify(body), REQUEST_TIMEOUT_MS);
    // اگر نسخه Ollama پارامتر think را نمی‌شناسد یا مدل از تفکر پشتیبانی نمی‌کند
    if (attempt.status === 400) {
      const { think: _think, ...rest } = body as typeof body & Record<string, unknown>;
      attempt = await postStream(`${OLLAMA_BASE_URL}/api/chat`, JSON.stringify(rest), REQUEST_TIMEOUT_MS);
    }
  } catch (e) {
    const detail = describeError(e);
    yield {
      error:
        `ارتباط با Ollama (${OLLAMA_BASE_URL}) برقرار نشد ← ${detail}.\n` +
        `اگر مدل برای اولین بار در حال بارگذاری است، چند لحظه بعد دوباره تلاش کنید؛ ` +
        `اگر تکرار شد: ۱) سرویس Ollama را ری‌استارت کنید ۲) با مدل سبک‌تر (qwen3:4b) امتحان کنید (احتمال کمبود رم).`,
    };
    return;
  }

  const status = attempt.status;
  if (status >= 400) {
    let detail = '';
    try {
      detail = (await readAll(attempt.res)).slice(0, 300);
    } catch {
      /* ignore */
    }
    yield { error: `خطای Ollama: HTTP ${status} ${detail}` };
    return;
  }

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
    for await (const line of ndjsonLines(attempt.res)) {
      let parsed: {
        message?: { content?: string; thinking?: string };
        done?: boolean;
        error?: string;
      };
      try {
        parsed = JSON.parse(line);
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
    if (carry) {
      yield insideThink ? { thinkingDelta: carry } : { contentDelta: carry };
    }
    yield { done: true };
  } catch (e) {
    yield { error: `قطع‌شدن جریان پاسخ: ${describeError(e)}` };
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
