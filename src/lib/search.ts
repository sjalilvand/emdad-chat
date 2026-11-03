// جستجوی اینترنت با چند موتور جایگزین و فیلتر ارتباط
// ترتیب: Bing HTML → Bing RSS → Bing News RSS → DDG Lite → DDG HTML → Google → SearXNG

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return ' ';
      }
    })
    .replace(/<!\[CDATA\[|\]\]>/g, '');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, 'Accept-Language': 'fa,en;q=0.8', ...(init?.headers || {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------
// Bing HTML
// ------------------------------------------------------------------
async function searchBingHtml(query: string): Promise<WebResult[]> {
  const res = await timedFetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=15`);
  if (!res || !res.ok) return [];
  const html = await res.text();
  const results: WebResult[] = [];
  const re =
    /<li class="b_algo[^"]*"[\s\S]*?<h2[^>]*><a[^>]+href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && results.length < 10) {
    const url = decodeEntities(m[1]);
    results.push({ title: stripTags(m[2]), url, snippet: m[3] ? stripTags(m[3]) : '' });
  }
  return results;
}

// ------------------------------------------------------------------
// Bing RSS (وب) و Bing News RSS — مقاوم در برابر آنتی‌بات
// ------------------------------------------------------------------
function parseRssItems(xml: string): WebResult[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const results: WebResult[] = [];
  for (const item of items) {
    const title = stripTags(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    let url = decodeEntities(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim();
    const description = stripTags(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '');
    // لینک‌های ریدایرکت خبری Bing: استخراج url= از داخل لینک
    const inner = url.match(/[?&]url=(https?[^&]+)/);
    if (inner) url = decodeURIComponent(inner[1]);
    if (!title || !/^https?:\/\//.test(url)) continue;
    results.push({ title, url, snippet: description });
  }
  return results;
}

async function searchBingRss(query: string): Promise<WebResult[]> {
  const res = await timedFetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=15`
  );
  if (!res || !res.ok) return [];
  return parseRssItems(await res.text());
}

async function searchBingNewsRss(query: string): Promise<WebResult[]> {
  const res = await timedFetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`);
  if (!res || !res.ok) return [];
  return parseRssItems(await res.text());
}

// ------------------------------------------------------------------
// DuckDuckGo
// ------------------------------------------------------------------
async function searchDdgLite(query: string): Promise<WebResult[]> {
  const res = await timedFetch('https://lite.duckduckgo.com/lite.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(query)}`,
  });
  if (!res || !res.ok) return [];
  const html = await res.text();
  const results: WebResult[] = [];
  const linkRe = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(stripTags(sm[1]));
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html)) && results.length < 10) {
    let url = decodeEntities(lm[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.includes('duckduckgo.com')) continue;
    results.push({ title: stripTags(lm[2]), url, snippet: snippets[i] || '' });
    i++;
  }
  return results;
}

async function searchDdgHtml(query: string): Promise<WebResult[]> {
  const res = await timedFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!res || !res.ok) return [];
  const html = await res.text();
  const results: WebResult[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && results.length < 10) {
    let url = decodeEntities(m[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.includes('duckduckgo.com')) continue;
    results.push({ title: stripTags(m[2]), url, snippet: m[3] ? stripTags(m[3]) : '' });
  }
  return results;
}

// ------------------------------------------------------------------
// Google (HTML ساده)
// ------------------------------------------------------------------
async function searchGoogle(query: string): Promise<WebResult[]> {
  const res = await timedFetch(
    `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=fa&gbv=1`
  );
  if (!res || !res.ok) return [];
  const html = await res.text();
  const results: WebResult[] = [];
  const re = /<a[^>]+href="\/url\?q=(https?[^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) && results.length < 10) {
    const url = decodeURIComponent(decodeEntities(m[1]));
    if (seen.has(url) || url.includes('google.')) continue;
    seen.add(url);
    results.push({ title: stripTags(m[2]) || url, url, snippet: '' });
  }
  return results;
}

// ------------------------------------------------------------------
// SearXNG (سرور اختصاصی از env یا نمونه‌های عمومی)
// ------------------------------------------------------------------
async function searchSearx(query: string): Promise<WebResult[]> {
  const bases = [process.env.SEARXNG_URL, 'https://searx.be'].filter(Boolean) as string[];
  for (const base of bases) {
    const res = await timedFetch(
      `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json&language=fa`
    );
    if (!res || !res.ok) continue;
    try {
      const data = (await res.json()) as { results?: { title: string; url: string; content?: string }[] };
      const results = (data.results || [])
        .slice(0, 10)
        .map((r) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }
  return [];
}

// ------------------------------------------------------------------
// فیلتر ارتباط: حذف نتایج بی‌ربط (مثل پاسخ‌های عمومی آنتی‌بات)
// ------------------------------------------------------------------
function relevanceFilter(query: string, results: WebResult[]): WebResult[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'http', 'https', 'www', 'com', 'ir']);
  const terms = query
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stop.has(t));
  if (terms.length === 0) return results;

  const scored = results.map((r) => {
    const hay = (r.title + ' ' + r.snippet).toLowerCase();
    const hits = terms.filter((t) => hay.includes(t)).length;
    return { r, hits };
  });
  const relevant = scored.filter((s) => s.hits > 0).map((s) => s.r);
  // اگر حداقل ۲ نتیجه مرتبط داریم فقط همان‌ها؛ وگرنه همان نتایج خام
  return relevant.length >= 2 ? relevant : results;
}

function dedupe(results: WebResult[]): WebResult[] {
  const seen = new Set<string>();
  const out: WebResult[] = [];
  for (const r of results) {
    const key = r.url.replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export interface SearchOutcome {
  results: WebResult[];
  engine: string;
}

export async function webSearch(query: string, limit = 5): Promise<SearchOutcome> {
  const engines: [string, (q: string) => Promise<WebResult[]>][] = [
    ['Bing', searchBingHtml],
    ['Bing RSS', searchBingRss],
    ['Bing News RSS', searchBingNewsRss],
    ['DuckDuckGo Lite', searchDdgLite],
    ['DuckDuckGo HTML', searchDdgHtml],
    ['Google', searchGoogle],
    ['SearXNG', searchSearx],
  ];
  for (const [name, fn] of engines) {
    try {
      const raw = await fn(query);
      const results = dedupe(relevanceFilter(query, raw));
      if (results.length > 0) {
        return { results: results.slice(0, limit), engine: name };
      }
    } catch (e) {
      console.error(`[SEARCH] موتور ${name} خطا داد:`, e instanceof Error ? e.message : e);
    }
  }
  return { results: [], engine: 'none' };
}

// دریافت متن یک صفحه برای استناد بهتر
export async function fetchPageContent(url: string, maxLen = 3500): Promise<string> {
  const res = await timedFetch(url);
  if (!res || !res.ok) return '';
  try {
    const html = await res.text();
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    return decodeEntities(body)
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
      .slice(0, maxLen);
  } catch {
    return '';
  }
}
