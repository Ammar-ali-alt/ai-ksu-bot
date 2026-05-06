require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// === الإعدادات المركزية ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === الربط السحابي (تأمين الوعي) ===
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ وعي البوت متصل بقاعدة البيانات السحابية المستديمة'))
    .catch(err => console.error('❌ فشل الاتصال بالذاكرة الخارجية:', err));

const MemorySchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    threads: { type: Map, of: Object, default: {} },
    projects: { type: Map, of: Object, default: {} },
    codes: { type: Map, of: String, default: {} }
});
const Memory = mongoose.model('Memory', MemorySchema);

// === الهوية الهندسية المعتمدة ===
const systemInstruction = `أنت Ai KSU، المساعد الهندسي الذي أسسه عمار، ومساعد تقني لأي مبرمج أو مطور. 
تمتلك شبكة ذاكرة سحابية (MongoDB) لربط وتذكر المحادثات الطويلة والقصيرة. 
مهمتك الوحيدة هي الدعم التقني في الروبوتكس، البرمجة، والإلكترونيات. 
عندما تُسأل عن هويتك، قل فقط: "المساعد الهندسي الذي أسسه عمار، ومساعد تقني لأي مبرمج أو مطور". 
تحدث بمهنية هندسية بحتة واستخدم الذاكرة لربط الخيوط ببعضها.`;

// === تسجيل كافة الأوامر (Full Stack Commands) ===
const commands = [
    {
        name: 'engineer',
        description: 'Open a dev-thread with persistent memory access',
        options: [{ name: 'query', type: 3, required: true, description: 'Technical issue' }]
    },
    {
        name: 'project',
        description: 'Design a full robot (Logic, Physics, Code)',
        options: [{ name: 'idea', type: 3, required: true, description: 'Describe your robot' }]
    },
    {
        name: 'code_review',
        description: 'Analyze, explain, or fix your code',
        options: [{ name: 'code', type: 3, required: true, description: 'Paste your code here' }]
    },
    {
        name: 'component',
        description: 'Get specs, pinouts, and official datasheet',
        options: [{ name: 'name', type: 3, required: true, description: 'Component name' }]
    }
];

client.once('ready', async () => {
    await client.application.commands.set(commands);
    console.log(`🚀 Ai KSU Fully Loaded for Ammar. Memory & Project Engines Active.`);
});

// === محرك الردود والذاكرة المركزية ===
async function getAIResponse(userId, threadId, currentMessage) {
    try {
        let userMem = await Memory.findOne({ userId: userId }) || new Memory({ userId: userId });
        let threadData = userMem.threads.get(threadId) || { history: [] };

        const messages = [
            { role: 'system', content: systemInstruction },
            ...threadData.history.slice(-14),
            { role: 'user', content: currentMessage }
        ];

        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            temperature: 0.5
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const aiMsg = res.data.choices[0].message.content;

        threadData.history.push({ role: 'user', content: currentMessage }, { role: 'assistant', content: aiMsg });
        userMem.threads.set(threadId, threadData);
        userMem.markModified('threads');
        await userMem.save();

        return aiMsg;
    } catch (error) {
        return "⚠️ خطأ في مزامنة شبكة الذاكرة السحابية.";
    }
}

// === معالج التفاعلات (Interactions) ===
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // 1. نظام الـ Threads والذاكرة
        if (commandName === 'engineer') {
            const query = interaction.options.getString('query');
            const msg = await interaction.reply({ content: `🛠️ **بدء جلسة تطوير:** ${query}`, fetchReply: true });
            const thread = await msg.startThread({ name: `Dev: ${query.substring(0, 15)}`, autoArchiveDuration: 60 });
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.threads.set(thread.id, { history: [] });
            await userMem.save();
            const response = await getAIResponse(interaction.user.id, thread.id, query);
            await thread.send(response);
        }

        // 2. محرك المشاريع
        else if (commandName === 'project') {
            await interaction.deferReply();
            const idea = interaction.options.getString('idea');
            const pId = `PRJ-${Date.now().toString(36).toUpperCase()}`;
            const res = await axios.post(GROQ_API, {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'Return JSON ONLY: {"name": "String", "logic": "String", "physics": "String", "components": [{"n": "Name", "p": "Pin"}], "code": "String"}' },
                    { role: 'user', content: `Design robot: ${idea}` }
                ]
            }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
            const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.projects.set(pId, data);
            await userMem.save();
            const embed = new EmbedBuilder().setTitle(`🚀 مشروع: ${data.name}`).setDescription(`**المنطق:** ${data.logic}\n\n**الفيزياء:** ${data.physics}`).setColor(0x2ECC71);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pcode_${pId}`).setLabel('Code (.ino)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pwiring_${pId}`).setLabel('Wiring').setStyle(ButtonStyle.Success)
            );
            await interaction.editReply({ embeds: [embed], components: [row] });
        }

        // 3. مراجعة الأكواد
        else if (commandName === 'code_review') {
            const code = interaction.options.getString('code');
            const cId = `CODE-${Date.now().toString(36).toUpperCase()}`;
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.codes.set(cId, code);
            await userMem.save();
            const embed = new EmbedBuilder().setTitle('🔍 محلل الأكواد الهندسي').setDescription('ماذا تريد أن أفعل بالكود؟').setColor(0xF1C40F);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cexplain_${cId}`).setLabel('شرح الكود').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`cfix_${cId}`).setLabel('تصحيح الأخطاء').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // 4. البحث عن القطع
        else if (commandName === 'component') {
            await interaction.deferReply();
            const name = interaction.options.getString('name');
            const res = await axios.post(GROQ_API, {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'Return JSON ONLY: {"n": "Name", "p": "Pins", "v": "V", "pr": "Price", "ds": "URL"}' },
                    { role: 'user', content: `Specs for: ${name}` }
                ]
            }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
            const d = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
            const embed = new EmbedBuilder().setTitle(`🔌 ${d.n}`).addFields({ name: '📍 Pinout', value: d.p }, { name: '🇪🇬 Price', value: `${d.pr} EGP`, inline: true }, { name: '📄 Datasheet', value: `[Link](${d.ds})`, inline: true }).setColor(0x3498DB);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Open Datasheet').setURL(d.ds).setStyle(ButtonStyle.Link));
            await interaction.editReply({ embeds: [embed], components: [row] });
        }
    }

    // معالج الأزرار الموحد
    else if (interaction.isButton()) {
        await handleButtons(interaction);
    }
});

async function handleButtons(interaction) {
    const [action, id] = interaction.customId.split('_');
    const userMem = await Memory.findOne({ userId: interaction.user.id });

    if (action === 'cexplain' || action === 'cfix') {
        await interaction.deferReply({ ephemeral: true });
        const code = userMem?.codes.get(id);
        const prompt = action === 'cexplain' ? `Explain this code: \n${code}` : `Fix bugs and explain: \n${code}`;
        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }]
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
        await interaction.editReply(res.data.choices[0].message.content);
    } else if (action === 'pcode' || action === 'pwiring') {
        const p = userMem?.projects.get(id);
        if (action === 'pcode') {
            const file = new AttachmentBuilder(Buffer.from(p.code), { name: `Ai_KSU_${id}.ino` });
            await interaction.reply({ content: `✅ كود مشروع ${p.name}:`, files: [file], ephemeral: true });
        } else {
            const w = p.components.map(c => `• **${c.n}** ➡️ Pin: ${c.p}`).join('\n');
            await interaction.reply({ content: `🔌 **التوصيلات:**\n${w}`, ephemeral: true });
        }
    }
}

client.on('messageCreate', async m => {
    if (m.author.bot || !m.channel.isThread()) return;
    const r = await getAIResponse(m.author.id, m.channel.id, m.content);
    if (r) await m.channel.send(r);
});

client.login(process.env.DISCORD_TOKEN);