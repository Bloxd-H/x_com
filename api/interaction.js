import { verifyKey } from 'discord-interactions';
import Pusher from 'pusher';

export default async function handler(req, res) {
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

    if (interaction.type === 1) {
        return res.status(200).json({ type: 1 });
    }

    if (interaction.type === 3) { 
        const customId = interaction.data.custom_id;
        
        if (customId.startsWith('open_modal::')) {
            const sessionId = customId.split('::')[1];

            return res.status(200).json({
                type: 9,
                data: {
                    custom_id: `submit_modal::${sessionId}`,
                    title: "ブロック人数の送信",
                    components: [
                        {
                            type: 1,
                            components: [
                                {
                                    type: 4,
                                    custom_id: "block_count",
                                    label: "ブロックされている人数",
                                    style: 1,
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

    if (interaction.type === 5) { 
        const customId = interaction.data.custom_id;

        if (customId.startsWith('submit_modal::')) {
             const sessionId = customId.split('::')[1];
            const count = interaction.data.components[0].components[0].value;
             const pusher = new Pusher({
                appId: process.env.PUSHER_APP_ID,
                key: process.env.PUSHER_KEY,
                secret: process.env.PUSHER_SECRET,
                cluster: process.env.PUSHER_CLUSTER,
                useTLS: true
            });

            await pusher.trigger(`diagnosis-${sessionId}`, 'result-event', {
                count: count
            });

            return res.status(200).json({
                type: 4,
                data: {
                    content: `✅ 送信完了: ${count}人をブラウザに表示`
                }
            });
        }
    }

    return res.status(400).send('Unknown interaction');
}
