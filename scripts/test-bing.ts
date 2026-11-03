const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const res = await fetch('https://www.bing.com/search?q=' + encodeURIComponent('کمیته امداد') , { headers: { 'User-Agent': UA, 'Accept-Language': 'fa,en;q=0.8' } });
const html = await res.text();
console.log('HTTP', res.status, 'len', html.length);
const idx = html.indexOf('b_algo');
console.log('idx b_algo:', idx);
if (idx > 0) console.log(html.slice(idx - 100, idx + 1000));
else console.log(html.slice(0, 600));
