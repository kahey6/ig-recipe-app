export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: '請提供 IG 網址' });
  }

  try {
    let cleanUrl = url.trim();
    if (!cleanUrl.endsWith('/')) {
      cleanUrl += '/';
    }

    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const html = await response.text();
    let caption = '';

    // 方案 1: 從 JSON-LD 提取
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (jsonLdMatch && jsonLdMatch[1]) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (Array.isArray(jsonLd) && jsonLd[0]?.articleBody) {
          caption = jsonLd[0].articleBody;
        } else if (jsonLd?.articleBody) {
          caption = jsonLd.articleBody;
        } else if (jsonLd?.caption) {
          caption = jsonLd.caption;
        }
      } catch (e) {}
    }

    // 方案 2: OpenGraph description
    if (!caption) {
      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
                          html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      if (ogDescMatch && ogDescMatch[1]) {
        caption = ogDescMatch[1];
      }
    }

    // 方案 3: OpenGraph title
    if (!caption) {
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        caption = ogTitleMatch[1];
      }
    }

    // 萬用 HTML 實體與 Unicode 數字編碼（&#x...;）解碼器
    caption = caption
      .replace(/&#x([0-9a-fA-F]+);/g, (match, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&#([0-9]+);/g, (match, code) => String.fromCodePoint(parseInt(code, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\\n/g, '\n');

    // 清理 IG 預設冗餘開頭
    if (caption.includes('on Instagram:')) {
      const parts = caption.split('on Instagram:');
      if (parts[1] && parts[1].trim()) {
        caption = parts[1].replace(/^["“]/, '').replace(/["”]$/, '').trim();
      }
    }

    if (!caption.trim()) {
      return res.status(404).json({ error: '無法讀取此 IG 內文，請使用「貼上純文字」功能！' });
    }

    return res.status(200).json({ caption });
  } catch (error) {
    return res.status(500).json({ error: '伺服器抓取失敗：' + error.message });
  }
}