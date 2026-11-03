const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = encodeURIComponent('کمیته امداد امام خمینی');
for (const url of [
  `https://www.bing.com/search?q=${q}&format=rss&count=10`,
  `https://www.bing.com/news/search?q=${q}&format=RSS`,
]) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    console.log('URL:', url.slice(30, 80), '| HTTP', res.status, '| items:', items.length);
    if (items[0]) console.log('  نمونه:', items[0].replace(/\s+/g, ' ').slice(0, 350));
  } catch (e) {
    console.log('FAILED', url.slice(30, 80), e instanceof Error ? e.message : e);
  }
}
