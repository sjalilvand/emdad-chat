const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_OLD = 'Mozilla/5.0 (Windows NT 6.1; rv:60.0) Gecko/20100101 Firefox/60.0';

async function probe(name: string, url: string, ua: string, patterns: RegExp[]) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'fa,en;q=0.8' }, signal: controller.signal });
    clearTimeout(timer);
    const html = await res.text();
    const found = patterns.map(p => `${p.source.slice(0,30)}:${p.test(html) ? 'HIT' : 'miss'}`).join(' | ');
    console.log(`${name}: HTTP ${res.status} len=${html.length} ${found}`);
    // نمایش اولین نتیجه در صورت وجود
    for (const p of patterns) {
      const m = html.match(p);
      if (m) { console.log(`  sample: ${m[0].slice(0, 200).replace(/\n/g, ' ')}`); break; }
    }
  } catch (e) {
    console.log(`${name}: FAILED ${e instanceof Error ? e.message : e}`);
  }
}

const q = encodeURIComponent('کمیته امداد امداد ولایت');
await probe('mojeek', `https://www.mojeek.com/search?q=${q}`, UA_DESKTOP, [/class="results[^"]*"[\s\S]{0,200}<a[^>]+href="(https?[^"]+)"/, /<h2><a[^>]+href="(https?[^"]+)"/]);
await probe('google-gbv', `https://www.google.com/search?q=${q}&gbv=1&num=10`, UA_OLD, [/\/url\?q=(https?[^&"]+)/, /<a href="(https?[^"]+)"[^>]*>/]);
await probe('ddg-html', `https://html.duckduckgo.com/html/?q=${q}`, UA_DESKTOP, [/result__a[^>]+href="([^"]+)"/]);
await probe('yandex', `https://yandex.com/search/?text=${q}`, UA_DESKTOP, [/href="(https?:\/\/yandex[^"]*search[^"]*)"/]);
await probe('brave-html', `https://search.brave.com/search?q=${q}`, UA_DESKTOP, [/<a[^>]+href="(https?[^"]+)"[^>]*class="[^"]*result[^"]*"/]);
await probe('startpage', `https://www.startpage.com/sp/search?query=${q}`, UA_DESKTOP, [/class="w-gl__result"/]);
