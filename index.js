require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// === الإعدادات التقنية ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === الربط السحابي (MongoDB) ===
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ وعي البوت متصل بقاعدة البيانات السحابية'))
    .catch(err => console.error('❌ فشل الاتصال بالذاكرة:', err));

const MemorySchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    threads: { type: Map, of: Object, default: {} },
    projects: { type: Map, of: Object, default: {} },
    codes: { type: Map, of: String, default: {} }
});
const Memory = mongoose.model('Memory', MemorySchema);

// === الهوية الهندسية النهائية والدقيقة ===
const systemInstruction = `أنت Ai KSU، المساعد الهندسي الذي أسسه عمار.
مهمتك: مساعد تقني لأي مبرمج أو مطور في مجال الروبوتات.
لا تذكر أي تخصصات أخرى. هويتك الرسمية هي:
"المساعد الهندسي الذي أسسه عمار، ومساعد تقني لأي مبرمج أو مطور في مجال الروبوتات."
لديك ذاكرة سحابية مرتبطة بـ MongoDB لتذكر وربط كل المحادثات الهندسية.`;

// === الأوامر ===
const commands = [
    { name: 'engineer', description: 'جلسة تطوير مع ذاكرة مستديمة', options: [{ name: 'query', type: 3, required: true, description: 'المشكلة التقنية' }] },
    { name: 'project', description: 'تصميم روبوت كامل (كود + فيزياء)', options: [{ name: 'idea', type: 3, required: true, description: 'فكرة الروبوت' }] },
    { name: 'code_review', description: 'فحص وتعديل الأكواد', options: [{ name: 'code', type: 3, required: true, description: 'انسخ الكود هنا' }] },
    { name: 'component', description: 'بيانات القطع والداتا شيت', options: [{ name: 'name', type: 3, required: true, description: 'اسم القطعة' }] }
];

client.once('ready', async () => {
    await client.application.commands.set(commands);
    console.log(`🚀 Ai KSU is fully optimized for Ammar.`);
});

// === المحرك المركزي ===
async function getAIResponse(userId, threadId, currentMessage) {
    let userMem = await Memory.findOne({ userId }) || new Memory({ userId });
    let threadData = userMem.threads.get(threadId) || { history: [] };
    const messages = [{ role: 'system', content: systemInstruction }, ...threadData.history.slice(-14), { role: 'user', content: currentMessage }];
    const res = await axios.post(GROQ_API, { model: 'llama-3.3-70b-versatile', messages, temperature: 0.5 }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
    const aiMsg = res.data.choices[0].message.content;
    threadData.history.push({ role: 'user', content: currentMessage }, { role: 'assistant', content: aiMsg });
    userMem.threads.set(threadId, threadData);
    userMem.markModified('threads');
    await userMem.save();
    return aiMsg;
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'engineer') {
            const query = interaction.options.getString('query');
            const msg = await interaction.reply({ content: `🛠️ **بدء الجلسة:** ${query}`, fetchReply: true });
            const thread = await msg.startThread({ name: `Dev: ${query.substring(0, 10)}`, autoArchiveDuration: 60 });
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.threads.set(thread.id, { history: [] });
            await userMem.save();
            await thread.send(await getAIResponse(interaction.user.id, thread.id, query));
        }

        else if (commandName === 'project') {
            await interaction.deferReply();
            const idea = interaction.options.getString('idea');
            const pId = `PRJ-${Date.now().toString(36).toUpperCase()}`;
            const res = await axios.post(GROQ_API, { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Return JSON: {"name": "String", "logic": "String", "physics": "String", "components": [{"n": "Name", "p": "Pin"}], "code": "String"}' }, { role: 'user', content: idea }] }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
            const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.projects.set(pId, data);
            await userMem.save();
            const embed = new EmbedBuilder().setTitle(`🚀 مشروع: ${data.name}`).setDescription(`**المنطق:** ${data.logic}\n\n**الفيزياء:** ${data.physics}`).setColor(0x2ECC71);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pcode_${pId}`).setLabel('Code (.ino)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`pwiring_${pId}`).setLabel('Wiring').setStyle(ButtonStyle.Success));
            await interaction.editReply({ embeds: [embed], components: [row] });
        }

        else if (commandName === 'code_review') {
            const code = interaction.options.getString('code');
            const cId = `CODE-${Date.now().toString(36).toUpperCase()}`;
            let userMem = await Memory.findOne({ userId: interaction.user.id }) || new Memory({ userId: interaction.user.id });
            userMem.codes.set(cId, code);
            await userMem.save();
            const embed = new EmbedBuilder().setTitle('🔍 محلل الأكواد').setDescription('ماذا تريد أن أفعل بالكود؟').setColor(0xF1C40F);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cexplain_${cId}`).setLabel('شرح الكود').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`cfix_${cId}`).setLabel('تصحيح الأخطاء').setStyle(ButtonStyle.Danger));
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        else if (commandName === 'component') {
            await interaction.deferReply();
            const name = interaction.options.getString('name');
            const res = await axios.post(GROQ_API, { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Return JSON: {"n": "Name", "p": "Pins", "v": "V", "pr": "Price", "ds": "URL"}' }, { role: 'user', content: name }] }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
            const d = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
            const embed = new EmbedBuilder().setTitle(`🔌 ${d.n}`).addFields({ name: '📍 Pinout', value: d.p }, { name: '🇪🇬 Price', value: `${d.pr} EGP`, inline: true }, { name: '📄 Datasheet', value: `[Link](${d.ds})`, inline: true }).setColor(0x3498DB);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Open Datasheet').setURL(d.ds).setStyle(ButtonStyle.Link));
            await interaction.editReply({ embeds: [embed], components: [row] });
        }
    }

    else if (interaction.isButton()) {
        const [action, id] = interaction.customId.split('_');
        const userMem = await Memory.findOne({ userId: interaction.user.id });
        if (action === 'cexplain' || action === 'cfix') {
            await interaction.deferReply({ ephemeral: true });
            const code = userMem?.codes.get(id);
            const prompt = action === 'cexplain' ? `Explain this code: \n${code}` : `Fix bugs and explain changes: \n${code}`;
            const res = await axios.post(GROQ_API, { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: prompt }] }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
            await interaction.editReply(res.data.choices[0].message.content);
        } else if (action === 'pcode' || action === 'pwiring') {
            const p = userMem?.projects.get(id);
            if (action === 'pcode') await interaction.reply({ files: [new AttachmentBuilder(Buffer.from(p.code), { name: `Ai_KSU_${id}.ino` })], ephemeral: true });
            else await interaction.reply({ content: `🔌 **التوصيلات:**\n${p.components.map(c => `• ${c.n} -> Pin ${c.p}`).join('\n')}`, ephemeral: true });
        }
    }
});

client.on('messageCreate', async m => {
    if (m.author.bot || !m.channel.isThread()) return;
    const r = await getAIResponse(m.author.id, m.channel.id, m.content);
    if (r) await m.channel.send(r);
});

client.login(process.env.DISCORD_TOKEN);