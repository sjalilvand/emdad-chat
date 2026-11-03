import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { searchKnowledgeBase, fetchPageText, loadEmdadCacheIfNeeded, EMDAD_PAGES } from '@/lib/kb';
import { webSearch, fetchPageContent, type WebResult } from '@/lib/search';
import { streamOllamaChat, streamMockChat, type OllamaMessage } from '@/lib/ollama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const KB_TTL_HOURS = Number(process.env.EMDAD_CACHE_TTL_HOURS || 12);

interface ChatRequestBody {
  conversationId?: string;
  message: string;
  model?: string;
  webSearch?: boolean;
  emdadSearch?: boolean;
  imageBase64?: string; // data URL
}

const SYSTEM_PROMPT = `تو «دستیار هوشمند کمیته امداد امام خمینی (ره)» هستی؛ یک چت‌بات فارسی‌زبان روی مدل محلی Ollama.

وظایف تو:
- پاسخ به سؤالات درباره کمیته امداد: برنامه پنج‌ساله هفتم (۱۴۰۳-۱۴۰۷)، دستورالعمل شناسایی و پذیرش، سامانه شفافیت، آمار و عملکرد، میز خدمت (سامانه سُها) و خدمات حمایتی.
- پاسخ به سؤالات عمومی با استفاده از نتایج جستجوی وب (در صورت فعال بودن).
- پاسخ همیشه فارسی، روان، دقیق و منظم با مارک‌داون (تیتر، فهرست، جدول در صورت نیاز).

قواعد مهم:
- فقط بر اساس «زمینه ارائه‌شده» و دانش خودت پاسخ بده؛ عدد و آمار را از خودت نساز.
- اگر اطلاعات کافی نیست، صادقانه بگو و راهنمایی کن کاربر از چه منبعی (مثلاً سایت emdad.ir یا سامانه سُها) پیگیری کند.
- وقتی از بخش‌های «پایگاه دانش» یا «نتایج جستجو» استفاده می‌کنی، منبع را با شماره داخل کروشه مثل [1] ذکر کن.
- پاسخ‌ها را مختصر و کاربردی بنویس؛ برای سؤال ساده، پاسخ کوتاه بده.`;

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function buildContextBlocks(
  kbHits: { docTitle: string; text: string; sourceType: string; url?: string }[],
  webResults: WebResult[],
  webContents: string[]
): string {
  let ctx = '';
  if (kbHits.length > 0) {
    ctx += '### پایگاه دانش کمیته امداد (اسناد رسمی):\n';
    kbHits.forEach((h, i) => {
      ctx += `\n[سند ${i + 1} - ${h.docTitle}]\n${h.text.slice(0, 1400)}\n`;
    });
    ctx += '\n';
  }
  if (webResults.length > 0) {
    ctx += '### نتایج جستجوی اینترنت:\n';
    webResults.forEach((r, i) => {
      ctx += `[${i + 1}] ${r.title}\nآدرس: ${r.url}\n${r.snippet || ''}\n`;
      if (webContents[i]) ctx += `محتوای صفحه:\n${webContents[i]}\n`;
    });
    ctx += '\n';
  }
  return ctx;
}

// تشخیص خودکار سؤالات مرتبط با کمیته امداد
const EMDAD_KEYWORDS = [
  'امداد', 'مددجو', 'مددکار', 'مستمری', 'پذیرش', 'شفاف', 'سها', 'سُها', 'میز خدمت',
  'ایتام', 'اکرام', 'زکات', 'نیکوکاری', 'نیکوکار', 'محسن', 'هبه', 'صدقه', 'انفاق',
  'قرض الحسنه', 'قرض‌الحسنه', 'امداد ولایت', 'مهربانی', 'خیریه', 'برنامه پنج ساله',
  'برنامه هفتم', 'دستورالعمل', 'نیازمند', 'محروم', 'توانمندسازی', 'خودکفایی', 'اشتغال مددجو',
  'کمیته', 'والی مهر', 'کانون', 'جهیزیه', 'ازدواج مددجو', 'بیمه مددجو', 'مسکن مددجو',
  'سامانه هوشمند', 'دهک', 'ضریب محرومیت', 'shafaf', 'soha', 'emdad',
];

function isEmdadRelated(text: string): boolean {
  const norm = text.toLowerCase();
  return EMDAD_KEYWORDS.some((k) => norm.includes(k));
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: 'بدنه درخواست نامعتبر است' }, { status: 400 });
  }

  const userMessage = (body.message || '').trim();
  if (!userMessage) {
    return Response.json({ error: 'متن پیام خالی است' }, { status: 400 });
  }

  const model = body.model || process.env.DEFAULT_MODEL || 'qwen3:8b';
  const useWeb = body.webSearch === true;
  const useEmdad = body.emdadSearch !== false; // پیش‌فرض روشن

  try {
    // ۱) یافتن یا ساخت گفتگو
    let conversationId = body.conversationId;
    if (conversationId) {
      const conv = await db.conversation.findUnique({ where: { id: conversationId } });
      if (!conv) conversationId = undefined;
    }
    if (!conversationId) {
      const title = userMessage.slice(0, 40).replace(/\s+/g, ' ') + (userMessage.length > 40 ? '…' : '');
      const conv = await db.conversation.create({ data: { title } });
      conversationId = conv.id;
    }

    // ۲) ذخیره پیام کاربر
    const userMsg = await db.message.create({
      data: {
        conversationId,
        role: 'user',
        content: userMessage,
        hasImage: !!body.imageBase64,
      },
    });

    // ۳) تاریخچه گفتگو
    const history = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 11,
    });
    history.reverse();

    // ۴) جستجوی پایگاه دانش امداد
    await loadEmdadCacheIfNeeded();
    const autoEmdad = isEmdadRelated(userMessage);
    let kbHits = useEmdad ? searchKnowledgeBase(userMessage, 7, true) : [];
    if (kbHits.length === 0 && autoEmdad) {
      // حتی اگر امتیازدهی نتیجه نداد، سؤال امدادی است → بهترین قطعات اسناد محلی
      kbHits = searchKnowledgeBase('کمیته امداد ' + userMessage, 5, true);
    }

    // ۵) جستجوی وب
    let webResults: WebResult[] = [];
    let webContents: string[] = [];
    let searchEngine = '';
    let emdadSiteLinks: { title: string; url: string; snippet: string }[] = [];
    const mock = process.env.MOCK_LLM === 'true';

    if (useWeb) {
      const outcome = await webSearch(userMessage, 5);
      webResults = outcome.results;
      searchEngine = outcome.engine;
      webContents = await Promise.all(webResults.slice(0, 2).map((r) => fetchPageContent(r.url)));
    }

    // ۶) اگر سؤال به یکی از صفحات خاص امداد اشاره دارد، صفحه هدف را فقط در صورت کهنه‌بودن کش دریافت کن
    if (useEmdad && autoEmdad && !mock) {
      const pageTargets: Record<string, string[]> = {
        shafaf: ['شفاف', 'shafaf'],
        stats63700: ['آمار', 'عملکرد', '63700'],
        soha: ['سُها', 'سها', 'soha', 'میز خدمت'],
      };
      let targetKey: string | null = null;
      const lowerMsg = userMessage.toLowerCase();
      for (const [key, kws] of Object.entries(pageTargets)) {
        if (kws.some((k) => lowerMsg.includes(k))) {
          targetKey = key;
          break;
        }
      }
      const target = EMDAD_PAGES.find((p) => p.key === targetKey);
      if (target) {
        const cached = await db.knowledgeDoc.findUnique({ where: { sourceKey: target.key } });
        const stale = !cached || Date.now() - cached.fetchedAt.getTime() > KB_TTL_HOURS * 3600 * 1000;
        if (stale) {
          const page = await fetchPageText(target.url);
          if (page && page.text.length > 200) {
            await db.knowledgeDoc.upsert({
              where: { sourceKey: target.key },
              create: { sourceKey: target.key, title: page.title || target.title, url: target.url, content: page.text },
              update: { title: page.title || target.title, content: page.text, fetchedAt: new Date() },
            });
            await loadEmdadCacheIfNeeded(true);
            kbHits.push({
              docId: target.key,
              docTitle: page.title || target.title,
              sourceType: 'emdad-page',
              url: target.url,
              chunkIndex: 0,
              text: page.text.slice(0, 2400),
            });
          }
        }
        emdadSiteLinks = [{ title: target.title, url: target.url, snippet: '' }];
      }
    }

    // ۷) ساخت پیام‌های مدل
    const contextBlock = buildContextBlocks(kbHits, webResults, webContents);
    const ollamaMessages: OllamaMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const h of history) {
      if (h.id === userMsg.id) continue;
      if (h.role !== 'user' && h.role !== 'assistant') continue;
      if (!h.content) continue;
      ollamaMessages.push({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 2000) });
    }
    let userContent = userMessage;
    if (contextBlock) {
      userContent = `${userMessage}\n\n---\nزمینه (Context) برای پاسخ‌دهی:\n${contextBlock}`;
    }
    const userApiMsg: OllamaMessage = { role: 'user', content: userContent };
    if (body.imageBase64) {
      const b64 = body.imageBase64.replace(/^data:[^;]+;base64,/, '');
      userApiMsg.images = [b64];
    }
    ollamaMessages.push(userApiMsg);

    // ۸) منابع برای UI
    const sources = [
      ...kbHits.slice(0, 8).map((h, i) => ({
        title:
          h.docTitle +
          (h.sourceType === 'emdad-page' ? ' (سایت امداد)' : h.sourceType === 'program7' ? ' (برنامه هفتم)' : ' (دستورالعمل پذیرش)'),
        url: h.url || '',
        snippet: h.text.slice(0, 120),
        key: `kb-${i}`,
      })),
      ...webResults.map((r, i) => ({ title: r.title, url: r.url, snippet: r.snippet, key: `web-${i}` })),
    ];

    // ۹) استریم SSE
    const encoder = new TextEncoder();
    const convId = conversationId;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* استریم بسته شده */ }
        };

        send({ type: 'meta', conversationId: convId, userMessageId: userMsg.id });
        if (useWeb) {
          send({ type: 'search', status: searchEngine ? 'done' : 'failed', engine: searchEngine, count: webResults.length });
        }
        send({ type: 'kb', hits: kbHits.length, emdadPages: emdadSiteLinks.map((l) => l.title) });
        send({ type: 'sources', sources });

        let fullContent = '';
        let fullThinking = '';
        let started = false;

        const emit = (delta: string, field: 'content' | 'thinking') => {
          if (field === 'content') fullContent += delta;
          else fullThinking += delta;
          if (!started) {
            started = true;
            send({ type: 'start' });
          }
          send({ type: field === 'content' ? 'content_delta' : 'thinking_delta', text: delta });
        };

        try {
          const gen = mock ? streamMockChat(userMessage) : streamOllamaChat(model, ollamaMessages, { temperature: 0.7 });

          for await (const chunk of gen) {
            if (chunk.error) {
              send({ type: 'error', message: chunk.error });
              continue;
            }
            if (chunk.thinkingDelta) emit(chunk.thinkingDelta, 'thinking');
            if (chunk.contentDelta) emit(chunk.contentDelta, 'content');
            if (chunk.done) break;
          }

          if (fullContent.trim().length === 0 && fullThinking.trim().length > 0) {
            fullContent = fullThinking;
            fullThinking = '';
          }

          const assistantMsg = await db.message.create({
            data: {
              conversationId: convId,
              role: 'assistant',
              content: fullContent,
              thinking: fullThinking || null,
              sources: sources.length > 0 ? JSON.stringify(sources) : null,
              model,
            },
          });

          send({ type: 'done', messageId: assistantMsg.id, conversationId: convId });
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'خطای ناشناخته' });
        } finally {
          try {
            controller.close();
          } catch { /* ignore */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    console.error('[CHAT] خطای کلی:', e);
    return Response.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}
