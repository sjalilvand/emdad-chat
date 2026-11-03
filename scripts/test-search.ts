// تست موتورهای جستجو از سندباکس
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function tryFetch(name: string, url: string, init?: RequestInit) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers || {}) }, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    console.log(`--- ${name}: HTTP ${res.status}, ${text.length} bytes`);
    return text;
  } catch (e) {
    console.log(`--- ${name}: FAILED ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function main() {
  const q = 'اخبار امروز';
  // DDG lite POST
  const lite = await tryFetch('ddg-lite-POST', 'https://lite.duckduckgo.com/lite.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(q)}`,
  });
  if (lite) console.log(lite.slice(0, 1500));
  // DDG lite GET
  await tryFetch('ddg-lite-GET', `https://lite.duckduckgo.com/lite.php?q=${encodeURIComponent(q)}`);
  // Bing
  const bing = await tryFetch('bing', `https://www.bing.com/search?q=${encodeURIComponent(q)}`);
  if (bing) {
    const m = bing.match(/<li class="b_algo[\s\S]{0,400}/);
    console.log('bing first result sample:', m ? m[0].slice(0, 400) : 'NO b_algo FOUND');
  }
  // Google
  const goog = await tryFetch('google', `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10`);
  if (goog) console.log(goog.slice(0, 300));
}

main();
