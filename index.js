require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// === الإعدادات التقنية ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === الربط بقاعدة البيانات (وعي البوت) ===
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ وعي البوت متصل بقاعدة البيانات السحابية المستديمة'))
    .catch(err => console.error('❌ فشل الاتصال بالذاكرة الخارجية:', err));

// === هيكل تخزين الذاكرة (Schema) ===
const MemorySchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    threads: { type: Map, of: Object, default: {} },
    projects: { type: Map, of: Object, default: {} },
    learned_facts: { type: Array, default: [] }
});
const Memory = mongoose.model('Memory', MemorySchema);

// === تعريف الأوامر الإنجليزية ===
const commands = [
    {
        name: 'engineer',
        description: 'Start a development thread for coding & persistent learning',
        options: [{ name: 'query', type: 3, required: true, description: 'Technical problem or idea' }]
    },
    {
        name: 'component',
        description: 'Search for component details, pinouts, and Egypt pricing',
        options: [{ name: 'name', type: 3, required: true, description: 'e.g. Ultrasonic, Driver, ESP32' }]
    },
    {
        name: 'project',
        description: 'Create a full robot project with physics and code',
        options: [{ name: 'idea', type: 3, required: true, description: 'Describe your robot' }]
    }
];

client.once('ready', async () => {
    await client.application.commands.set(commands);
    console.log(`✅ Ai KSU is ready for Ammar. Commands synced.`);
});

// === مستقبِل التفاعلات ===
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'engineer') await handleEngineerThread(interaction);
        else if (commandName === 'component') await handleComponentSearch(interaction);
        else if (commandName === 'project') await handleComplexProject(interaction);
    }
    else if (interaction.isButton()) {
        if (interaction.customId.startsWith('search_')) {
            await handleComponentDetail(interaction, interaction.customId.split('_')[1]);
        } else {
            await handleProjectButtons(interaction);
        }
    }
});

// --- 1. نظام الـ Threads والذاكرة (Engineer Mode) ---
async function handleEngineerThread(interaction) {
    const query = interaction.options.getString('query');
    const msg = await interaction.reply({ content: `🛠️ **جاري فتح جلسة تطوير تقنية:** ${query}`, fetchReply: true });
    const thread = await msg.startThread({ name: `Dev: ${query.substring(0, 15)}`, autoArchiveDuration: 60 });

    let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
    userMem.threads.set(thread.id, { history: [{ role: 'user', content: query }] });
    await userMem.save();

    const res = await axios.post(GROQ_API, {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'أنت مهندس خبير ومساعد لعمار. تذكر سياق النقاش في هذا الثريد.' }, { role: 'user', content: query }]
    }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

    await thread.send(res.data.choices[0].message.content);
}

// --- مستمع الرسائل داخل الـ Threads (التعلم المستمر) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.channel.isThread()) return;

    let userMem = await Memory.findOne({ "threads": { $exists: true } });
    if (!userMem || !userMem.threads.has(message.channel.id)) return;

    const threadData = userMem.threads.get(message.channel.id);
    threadData.history.push({ role: 'user', content: message.content });

    const res = await axios.post(GROQ_API, {
        model: 'llama-3.3-70b-versatile',
        messages: [...threadData.history]
    }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

    const aiMsg = res.data.choices[0].message.content;
    threadData.history.push({ role: 'assistant', content: aiMsg });

    userMem.markModified('threads');
    await userMem.save();
    await message.channel.send(aiMsg);
});

// --- 2. البحث الذكي عن القطع (Component Search) ---
async function handleComponentSearch(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString('name');

    try {
        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'system',
                content: `Analyze query "${query}". If general, suggest 4 specific sub-types. Return JSON ONLY: {"is_general": true, "categories": [{"label": "Name", "value": "ID"}]}`
            }]
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);

        if (data.is_general) {
            const row = new ActionRowBuilder().addComponents(
                data.categories.map(cat => new ButtonBuilder().setCustomId(`search_${cat.value}`).setLabel(cat.label).setStyle(ButtonStyle.Primary))
            );
            await interaction.editReply({ content: `🔍 **يا عمار، لقيت كذا نوع يندرج تحت "${query}":**`, components: [row] });
        }
    } catch (e) { await interaction.editReply('❌ فشل تصنيف القطع.'); }
}

async function handleComponentDetail(interaction, compName) {
    const res = await axios.post(GROQ_API, {
        model: 'llama-3.3-70b-versatile',
        messages: [{
            role: 'system',
            content: `Return JSON ONLY: {"name": "Name", "pinout": "Explain every pin like Trig, Echo, VCC", "v": "Voltage", "price": "Price EGP", "img": "electronics keyword"}`
        }, { role: 'user', content: compName }]
    }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

    const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
    const embed = new EmbedBuilder()
        .setTitle(`🔌 تفاصيل القطعة: ${data.name}`)
        .addFields(
            { name: '📍 شرح البنات (Pinout)', value: data.pinout },
            { name: '⚡ الكهرباء', value: data.v, inline: true },
            { name: '🇪🇬 السعر التقريبي', value: `${data.price} ج.م`, inline: true }
        ).setColor(0x3498DB);

    await interaction.update({ content: '✅ تم جلب البيانات التقنية:', embeds: [embed], components: [] });
}

// --- 3. نظام المشاريع (Project Engine) ---
async function handleComplexProject(interaction) {
    await interaction.deferReply();
    const idea = interaction.options.getString('idea');
    const pId = `PRJ-${Date.now().toString(36).toUpperCase()}`;

    try {
        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'system',
                content: `Analyze robot and return JSON: {"name": "Name", "logic": "Algo", "physics": "Laws", "components": [{"n": "C", "p": "P"}], "code": "C++"}`
            }, { role: 'user', content: idea }]
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
        let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
        userMem.projects.set(pId, data);
        await userMem.save();

        const embed = new EmbedBuilder().setTitle(`🚀 ${data.name}`).setDescription(`**المنطق:** ${data.logic}`).setColor(0x2ECC71);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`code_${pId}`).setLabel('Code').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`wiring_${pId}`).setLabel('Wiring').setStyle(ButtonStyle.Success)
        );
        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) { await interaction.editReply('❌ فشل إنشاء المشروع.'); }
}

async function handleProjectButtons(interaction) {
    const [action, id] = interaction.customId.split('_');
    const userMem = await Memory.findOne({ userId: interaction.user.id });
    const p = userMem?.projects.get(id);
    if (!p) return interaction.reply({ content: '❌ المشروع غير موجود.', ephemeral: true });

    if (action === 'code') {
        const file = new AttachmentBuilder(Buffer.from(p.code), { name: `src_${id}.ino` });
        await interaction.reply({ files: [file], ephemeral: true });
    } else if (action === 'wiring') {
        await interaction.reply({ content: `⚡ **التوصيلات:**\n` + p.components.map(c => `• ${c.n} -> Pin ${c.p}`).join('\n'), ephemeral: true });
    }
}

client.login(process.env.DISCORD_TOKEN);