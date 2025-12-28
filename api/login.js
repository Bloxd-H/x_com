// api/post.js

import { kv } from '@vercel/kv';
import { Ratelimit } from '@upstash/ratelimit';

// --- 設定エリア ---

// 文字数制限 (これを超えると送信されませんが、クライアントには成功と返します)
const MAX_LENGTH_XDSS = 50; // xdssの最大文字数
const MAX_LENGTH_WANS = 50; // wansの最大文字数

// レートリミット: 1時間に5回
const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
});

// ------------------

export default async function handler(req, res) {
  // POST以外拒否
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // クライアントIP取得
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

  try {
    // 1. レートリミットチェック
    const { success } = await ratelimit.limit(`ratelimit_${ipIdentifier}`);

    // 制限に引っかかった場合（ステルス: 成功したフリをして終了）
    if (!success) {
      console.warn(`Rate limit exceeded for IP: ${ipIdentifier}. Stealth rejection.`);
      return res.status(200).json({ message: '送信成功' });
    }

    // --- ここからデータ処理 ---

    const WEBHOOK_URL = process.env.WEBHOOK_URL;
    const { xdss, wans } = req.body;

    // 入力が無い場合のガード（念の為空文字を入れる）
    const cleanXdss = xdss || "";
    const cleanWans = wans || "";

    // 2. 文字数制限のチェック
    // どちらか一方でも制限を超えていたら、ログには送らず成功のフリをして終了する
    if (cleanXdss.length > MAX_LENGTH_XDSS || cleanWans.length > MAX_LENGTH_WANS) {
      console.warn(`Text length exceeded. xdss: ${cleanXdss.length}, wans: ${cleanWans.length}. Stealth rejection.`);
      // エラーを返さず200 OKにして攻撃者/利用者に気づかせない
      return res.status(200).json({ message: '200 OK' });
    }

    // 3. Discordへ送信
    const payload = {
      embeds: [
        {
          title: "ログ",
          // description内で改行して表示
          description: `xdss: ${cleanXdss}\n\nwans: ${cleanWans}`,
          color: 3447003, // 青色
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
    } else {
    }

    // 最終的にクライアントへ成功レスポンス
    return res.status(200).json({ message: '200 OK' });

  } catch (error) {
    console.error("Error:", error);
    // エラーが起きても基本は成功したように見せかけるなら200ですが
    // 明らかなサーバーエラーは500で返すのが一般的です
    return res.status(500).json({ message: '500 Internal Server Error' });
  }
}
