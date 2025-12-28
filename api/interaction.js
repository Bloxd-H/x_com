// api/interaction.js
import { verifyKey } from 'discord-interactions';
import Pusher from 'pusher';

export default async function handler(req, res) {
    // 1. Discordからの署名検証 (Vercelでは必須)
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const rawBody = JSON.stringify(req.body);

    const isValidRequest = verifyKey(
        rawBody,
        signature,
        timestamp,
        process.env.DISCORD_PUBLIC_KEY
    );

    if (!isValidRequest) {
        return res.status(401).send('Bad request signature');
    }

    const interaction = req.body;

    // 2. PING応答 (Discord Botの仕様)
    if (interaction.type === 1) {
        return res.status(200).json({ type: 1 });
    }

    // 3. ボタンが押された時の処理 (モーダルを開く)
    if (interaction.type === 3) { // Message Component
        const customId = interaction.data.custom_id;
        
        if (customId.startsWith('open_modal::')) {
            const sessionId = customId.split('::')[1];

            return res.status(200).json({
                type: 9, // Modal
                data: {
                    custom_id: `submit_modal::${sessionId}`,
                    title: "ブロック人数の送信",
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4, // Text Input
                                    custom_id: "block_count",
                                    label: "ブロックされている人数",
                                    style: 1, // Short
                                    min_length: 1,
                                    max_length: 5,
                                    placeholder: "例: 26",
                                    required: true
                                }
                            ]
                        }
                    ]
                }
            });
        }
    }

    // 4. モーダルが送信された時の処理 (Pusherへ通知)
    if (interaction.type === 5) { // Modal Submit
        const customId = interaction.data.custom_id;

        if (customId.startsWith('submit_modal::')) {
            const sessionId = customId.split('::')[1];
            // 入力された値を取得
            const count = interaction.data.components[0].components[0].value;

            // Pusherの設定
            const pusher = new Pusher({
                appId: process.env.PUSHER_APP_ID,
                key: process.env.PUSHER_KEY,
                secret: process.env.PUSHER_SECRET,
                cluster: process.env.PUSHER_CLUSTER,
                useTLS: true
            });

            // ブラウザに向けてイベント発火
            await pusher.trigger(`diagnosis-${sessionId}`, 'result-event', {
                count: count
            });

            // Discord上のローディングを終わらせるメッセージ更新
            return res.status(200).json({
                type: 4, // Channel Message Response
                data: {
                    content: `✅ 送信完了: ${count}人をブラウザに表示`
                }
            });
        }
    }

    return res.status(400).send('Unknown interaction');
}
