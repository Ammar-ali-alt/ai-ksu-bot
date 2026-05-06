require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// === الإعدادات التقنية ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === الربط السحابي لشبكة الذاكرة ===
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ وعي البوت متصل بقاعدة البيانات السحابية المستديمة'))
    .catch(err => console.error('❌ فشل الاتصال بالذاكرة الخارجية:', err));

const MemorySchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    threads: { type: Map, of: Object, default: {} }
});
const Memory = mongoose.model('Memory', MemorySchema);

// === تعريف الهوية الهندسية المعتمد ===
const systemInstruction = `
أنت Ai KSU، المساعد الهندسي الذي أسسه عمار، ومساعد تقني لأي مبرمج أو مطور.
أنت تمتلك "شبكة ذاكرة سحابية" (MongoDB) لربط وتذكر المحادثات الطويلة والقصيرة.
مهمتك الوحيدة هي الدعم التقني في الروبوتكس، البرمجة، والإلكترونيات.
عندما تُسأل عن هويتك، قل فقط: "المساعد الهندسي الذي أسسه عمار، ومساعد تقني لأي مبرمج أو مطور".
تحدث بمهنية هندسية واسترجع المعلومات السابقة لربط الخيوط ببعضها.
`;

// === تسجيل الأوامر ===
const commands = [
    {
        name: 'engineer',
        description: 'Open a dev-thread with persistent memory',
        options: [{ name: 'query', type: 3, required: true, description: 'Technical issue' }]
    },
    {
        name: 'component',
        description: 'Get specs, pinouts, and official datasheet',
        options: [{ name: 'name', type: 3, required: true, description: 'Component name' }]
    }
];

client.once('ready', async () => {
    await client.application.commands.set(commands);
    console.log(`✅ Ai KSU Engineering Assistant is online for Ammar.`);
});

// === محرك الردود وشبكة الذاكرة ===
async function getAIResponse(userId, threadId, currentMessage) {
    try {
        let userMem = await Memory.findOne({ userId: userId }) || new Memory({ userId: userId });
        let threadData = userMem.threads.get(threadId) || { history: [] };

        const messages = [
            { role: 'system', content: systemInstruction },
            ...threadData.history.slice(-14), // استرجاع الذاكرة النشطة
            { role: 'user', content: currentMessage }
        ];

        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            temperature: 0.5
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const aiMsg = res.data.choices[0].message.content;

        threadData.history.push({ role: 'user', content: currentMessage });
        threadData.history.push({ role: 'assistant', content: aiMsg });
        userMem.threads.set(threadId, threadData);
        userMem.markModified('threads');
        await userMem.save();

        return aiMsg;
    } catch (error) {
        return "⚠️ خطأ في استرجاع شبكة الذاكرة.";
    }
}

// === التعامل مع التفاعلات ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'engineer') {
        const query = interaction.options.getString('query');
        const msg = await interaction.reply({ content: `🛠️ **بدء جلسة تطوير:** ${query}`, fetchReply: true });
        const thread = await msg.startThread({ name: `Dev: ${query.substring(0, 15)}`, autoArchiveDuration: 60 });
        
        let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
        userMem.threads.set(thread.id, { history: [] });
        await userMem.save();

        const response = await getAIResponse(interaction.user.id, thread.id, query);
        await thread.send(response);

    } else if (interaction.commandName === 'component') {
        await interaction.deferReply();
        const query = interaction.options.getString('name');
        
        try {
            const res = await axios.post(GROQ_API, {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'Return JSON ONLY: {"name": "String", "pins": "String", "v": "String", "price": "String", "datasheet": "URL"}' },
                    { role: 'user', content: `Technical specs and datasheet for: ${query}` }
                ]
            }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

            const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
            const embed = new EmbedBuilder()
                .setTitle(`🔌 قطعة: ${data.name}`)
                .addFields(
                    { name: '📍 Pinout', value: data.pins },
                    { name: '⚡ Voltage', value: data.v, inline: true },
                    { name: '🇪🇬 Price', value: `${data.price} EGP`, inline: true },
                    { name: '📄 Datasheet', value: `[Official Link](${data.datasheet})` }
                ).setColor(0x3498DB);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Open Datasheet').setURL(data.datasheet).setStyle(ButtonStyle.Link)
            );
            await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (e) { await interaction.editReply('❌ فشل جلب البيانات.'); }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.channel.isThread()) return;
    const response = await getAIResponse(message.author.id, message.channel.id, message.content);
    if (response) await message.channel.send(response);
});

client.login(process.env.DISCORD_TOKEN);