import fs from 'fs';
import path from 'path';
import { extractQueryTerms, normalizePersian } from './persian';
import { db } from './db';

export interface KbChunk {
  docId: string;
  docTitle: string;
  sourceType: 'program7' | 'paziroosh' | 'emdad-page';
  url?: string;
  chunkIndex: number;
  text: string;
  _norm?: string;
}

export interface KbHit extends KbChunk {
  score: number;
}

export interface EmdadPageDef {
  key: string;
  title: string;
  url: string;
}

// صفحات رسمی کمیته امداد که به‌صورت دوره‌ای دریافت و کش می‌شوند
export const EMDAD_PAGES: EmdadPageDef[] = [
  { key: 'shafaf', title: 'سامانه شفافیت کمیته امداد', url: 'https://komiteemdad.emdad.ir/fa/shafaf' },
  { key: 'stats63700', title: 'آمار و عملکرد کمیته امداد', url: 'https://komiteemdad.emdad.ir/node/63700' },
  { key: 'soha', title: 'میز خدمت الکترونیک (سامانه سُها)', url: 'https://komiteemdad.emdad.ir/fa/soha' },
  { key: 'emdad-home', title: 'پرتال اطلاع‌رسانی کمیته امداد امام خمینی (ره)', url: 'https://www.emdad.ir' },
];

const KB_TTL_MS = Number(process.env.EMDAD_CACHE_TTL_HOURS || 12) * 3600 * 1000;
const FETCH_TIMEOUT_MS = 20000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ------------------------------------------------------------------
// بارگذاری اسناد ثابت (برنامه هفتم و دستورالعمل پذیرش)
// ------------------------------------------------------------------

interface StaticDoc {
  id: string;
  title: string;
  file: string;
  sourceType: KbChunk['sourceType'];
}

const STATIC_DOCS: StaticDoc[] = [
  { id: 'program7', title: 'برنامه پنج‌ساله هفتم کمیته امداد (۱۴۰۳ تا ۱۴۰۷)', file: 'Program7.txt', sourceType: 'program7' },
  { id: 'paziroosh', title: 'دستورالعمل شناسایی و پذیرش نیازمندان', file: 'DastoorolAmal_Paziroosh.txt', sourceType: 'paziroosh' },
];

const CHUNK_SIZE = 1100;
const CHUNK_OVERLAP = 180;

function splitIntoChunks(text: string, size: number, overlap: number): string[] {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const lastBreak = clean.lastIndexOf('\n', end);
      if (lastBreak > i + size * 0.5) end = lastBreak;
    }
    chunks.push(clean.slice(i, end).trim());
    const next = end - overlap;
    i = next > i ? next : end;
  }
  return chunks.filter((c) => c.length > 40);
}

let staticChunks: KbChunk[] | null = null;

export function getStaticChunks(): KbChunk[] {
  if (staticChunks) return staticChunks;
  const dataDir = process.env.KB_DATA_DIR || path.join(process.cwd(), 'data');
  const all: KbChunk[] = [];
  for (const doc of STATIC_DOCS) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, doc.file), 'utf-8');
      splitIntoChunks(raw, CHUNK_SIZE, CHUNK_OVERLAP).forEach((text, i) =>
        all.push({ docId: doc.id, docTitle: doc.title, sourceType: doc.sourceType, chunkIndex: i, text })
      );
    } catch (e) {
      console.error(`[KB] خطا در بارگذاری سند ${doc.file}:`, e);
    }
  }
  staticChunks = all;
  console.log(`[KB] ${all.length} قطعه از اسناد ثابت بارگذاری شد`);
  return all;
}

// ------------------------------------------------------------------
// امتیازدهی و جستجو
// ------------------------------------------------------------------

function norm(chunk: KbChunk): string {
  if (!chunk._norm) chunk._norm = normalizePersian(chunk.text);
  return chunk._norm;
}

function scoreChunk(chunk: KbChunk, terms: string[]): number {
  const n = norm(chunk);
  let score = 0;
  for (const term of terms) {
    let idx = n.indexOf(term);
    if (idx === -1) continue;
    let count = 0;
    while (idx !== -1 && count < 6) {
      count++;
      idx = n.indexOf(term, idx + term.length);
    }
    score += count * (term.length >= 4 ? 3 : 2) + (n.indexOf(term) < 300 ? 2 : 0);
  }
  const titleNorm = normalizePersian(chunk.docTitle);
  for (const term of terms) {
    if (titleNorm.includes(term)) score += 2;
  }
  return score;
}

let emdadMemoryChunks: KbChunk[] = [];
let emdadCacheLoadedAt = 0;

export async function loadEmdadCacheIfNeeded(force = false): Promise<void> {
  if (!force && Date.now() - emdadCacheLoadedAt < 60_000) return;
  try {
    const docs = await db.knowledgeDoc.findMany();
    const chunks: KbChunk[] = [];
    for (const doc of docs) {
      splitIntoChunks(doc.content, CHUNK_SIZE, CHUNK_OVERLAP).forEach((text, i) =>
        chunks.push({
          docId: doc.sourceKey,
          docTitle: doc.title,
          sourceType: 'emdad-page',
          url: doc.url,
          chunkIndex: i,
          text,
        })
      );
    }
    emdadMemoryChunks = chunks;
    emdadCacheLoadedAt = Date.now();
  } catch (e) {
    console.error('[EMDAD] خطا در خواندن کش دانش از دیتابیس:', e);
  }
}

export function searchKnowledgeBase(query: string, limit = 6, includeEmdadPages = true): KbHit[] {
  const terms = extractQueryTerms(query);
  if (terms.length === 0) return [];

  const allChunks: KbChunk[] = [...getStaticChunks()];
  if (includeEmdadPages) allChunks.push(...emdadMemoryChunks);

  const hits: KbHit[] = [];
  for (const chunk of allChunks) {
    const score = scoreChunk(chunk, terms);
    if (score > 0) hits.push({ ...chunk, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.filter((h) => h.score >= 4).slice(0, limit);
}

// ------------------------------------------------------------------
// دریافت و کش صفحات emdad.ir
// ------------------------------------------------------------------

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&zwnj;/g, '\u200C')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export async function fetchPageText(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fa,en;q=0.8', Accept: 'text/html,*/*' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.error(`[EMDAD] دریافت ${url} ناموفق: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 120) : url;
    let text = stripHtml(html);
    if (text.length > 30000) text = text.slice(0, 30000);
    return { title, text };
  } catch (e) {
    console.error(`[EMDAD] خطا در دریافت ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export interface RefreshResult {
  key: string;
  title: string;
  url: string;
  ok: boolean;
  chars: number;
  error?: string;
}

export async function refreshEmdadPages(force = false): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const page of EMDAD_PAGES) {
    try {
      const existing = await db.knowledgeDoc.findUnique({ where: { sourceKey: page.key } });
      const fresh = existing && Date.now() - existing.fetchedAt.getTime() < KB_TTL_MS;
      if (fresh && !force) {
        results.push({ key: page.key, title: page.title, url: page.url, ok: true, chars: existing.content.length });
        continue;
      }
      const fetched = await fetchPageText(page.url);
      if (fetched && fetched.text.length > 200) {
        await db.knowledgeDoc.upsert({
          where: { sourceKey: page.key },
          create: { sourceKey: page.key, title: fetched.title || page.title, url: page.url, content: fetched.text },
          update: { title: fetched.title || page.title, content: fetched.text, fetchedAt: new Date() },
        });
        results.push({ key: page.key, title: page.title, url: page.url, ok: true, chars: fetched.text.length });
      } else {
        results.push({
          key: page.key, title: page.title, url: page.url, ok: false, chars: 0,
          error: 'دریافت صفحه ناموفق بود (سایت در دسترس نیست یا توسط شبکه مسدود شده است)',
        });
      }
    } catch (e) {
      results.push({
        key: page.key, title: page.title, url: page.url, ok: false, chars: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await loadEmdadCacheIfNeeded(true);
  return results;
}

export async function getKbStatus() {
  const docs = await db.knowledgeDoc.findMany({
    select: { sourceKey: true, title: true, url: true, fetchedAt: true },
  });
  return {
    staticDocs: STATIC_DOCS.map((d) => ({
      id: d.id,
      title: d.title,
      chunks: getStaticChunks().filter((c) => c.docId === d.id).length,
    })),
    emdadPages: docs.map((d) => ({
      key: d.sourceKey,
      title: d.title,
      url: d.url,
      fetchedAt: d.fetchedAt,
      stale: Date.now() - d.fetchedAt.getTime() > KB_TTL_MS,
    })),
  };
}

// ------------------------------------------------------------------
// جستجو در خود سایت emdad.ir (روی سرور کاربر اجرا می‌شود)
// ------------------------------------------------------------------

export async function searchEmdadSite(
  query: string,
  limit = 3
): Promise<{ title: string; url: string; snippet: string }[]> {
  const results: { title: string; url: string; snippet: string }[] = [];
  const seen = new Set<string>();

  try {
    const searchUrl = `https://komiteemdad.emdad.ir/search/node?keys=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fa,en;q=0.8' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      const linkRe = /<a[^>]+href="(\/[^"]*|https:\/\/komiteemdad\.emdad\.ir[^"]*)"[^>]*>([^<]{8,120})<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) && results.length < limit) {
        let href = m[1];
        const title = m[2].trim();
        if (href.startsWith('/')) href = 'https://komiteemdad.emdad.ir' + href;
        if (seen.has(href) || href.includes('/search') || /\.(png|jpg|jpeg|pdf|css|js|ico|svg)$/i.test(href)) continue;
        seen.add(href);
        results.push({ title, url: href, snippet: '' });
      }
    }
  } catch (e) {
    console.error('[EMDAD] خطای جستجوی سایت:', e instanceof Error ? e.message : e);
  }

  if (results.length === 0) {
    for (const page of EMDAD_PAGES) {
      if (results.length >= limit) break;
      results.push({ title: page.title, url: page.url, snippet: 'صفحه رسمی کمیته امداد (فهرست صفحات شناخته‌شده)' });
    }
  }
  return results.slice(0, limit);
}

// گرم‌کردن کش هنگام شروع سرور
if (process.env.NODE_ENV !== 'test') {
  const warmup = async () => {
    await loadEmdadCacheIfNeeded(true);
    if (process.env.EMDAD_AUTOFETCH_ON_START !== 'false') {
      refreshEmdadPages(false).catch(() => {});
    }
  };
  warmup().catch(() => {});
}
