const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const q = encodeURIComponent('برنامه پنج ساله هفتم کمیته امداد');
for (const url of [
  `https://www.bing.com/search?q=${q}&format=rss&count=10&mkt=fa-IR`,
  `https://www.bing.com/search?q=${q}&format=rss&count=10&setlang=fa&mkt=fa-IR&cc=IR`,
]) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    console.log('HTTP', res.status, '| items:', items.length, '| mkt:', url.includes('mkt=fa-IR') ? 'yes' : 'no');
    for (const it of items.slice(0, 3)) {
      const t = it.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
      console.log('  -', t.replace(/<!\[CDATA\[|\]\]>/g, '').slice(0, 100));
    }
  } catch (e) {
    console.log('FAILED', e instanceof Error ? e.message : e);
  }
}
