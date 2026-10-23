export default async function handler(req, res) {
  // 設定 CORS Header
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
    // 使用偽裝 User-Agent 抓取 IG 頁面
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const html = await response.text();

    // 透過正則表達式提取 OpenGraph meta description (含有 IG Caption)
    let caption = '';
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i) ||
                        html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);

    if (ogDescMatch && ogDescMatch[1]) {
      caption = ogDescMatch[1];
    } else {
      // 備用方案：搜尋 title meta
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        caption = ogTitleMatch[1];
      }
    }

    // 解碼 HTML Entities (例如 &quot;, &#10; 換行符等)
    caption = caption
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#10;/g, '\n')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    if (!caption.trim()) {
      return res.status(404).json({ error: '無法從該 IG 網址讀取內文，請嘗試使用純文字複製貼上。' });
    }

    return res.status(200).json({ caption });
  } catch (error) {
    return res.status(500).json({ error: '伺服器抓取失敗：' + error.message });
  }
}