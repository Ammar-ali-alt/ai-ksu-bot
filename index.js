require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// === الإعدادات الأساسية ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === الذاكرة الدائمة (Brain) ===
const DB_FILE = './brain.json';
let brain = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : { projects: {}, lessons: [] };

function updateBrain(data) {
    brain = { ...brain, ...data };
    fs.writeFileSync(DB_FILE, JSON.stringify(brain, null, 2));
}

// === تعريف الأوامر بالإنجليزية للسرعة (Slash Commands) ===
const commands = [
    {
        name: 'engineer',
        description: 'Chat with the AI engineer to solve technical problems or debug code',
        options: [{ name: 'query', type: 3, required: true, description: 'Describe your issue or ask a question' }]
    },
    {
        name: 'project',
        description: 'Build a new robot project from scratch with physical analysis',
        options: [{ name: 'idea', type: 3, required: true, description: 'Your robot idea' }]
    },
    {
        name: 'upgrade',
        description: 'Upgrade an existing project or swap components',
        options: [
            { name: 'id', type: 3, required: true, description: 'Project ID' },
            { name: 'request', type: 3, required: true, description: 'What do you want to change or learn?' }
        ]
    }
];

// === تشغيل البوت وتسجيل الأوامر ===
client.once('ready', async () => {
    console.log(`✅ Ai KSU is online as ${client.user.tag}`);
    try {
        await client.application.commands.set(commands);
        console.log('✅ English commands registered successfully');
        client.user.setActivity('🛠️ Engineering & AI', { type: 4 });
    } catch (err) { console.error('Error registering commands:', err); }
});

// === مستقبِل التفاعلات ===
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'engineer') await handleExpertChat(interaction);
        else if (commandName === 'project') await handleComplexProject(interaction);
        else if (commandName === 'upgrade') await handleUpgrade(interaction);
    }
    else if (interaction.isButton()) {
        await handleProjectButtons(interaction);
    }
});

// --- 1. وظيفة الـ Engineer (حل المشكلات والتعلم) ---
async function handleExpertChat(interaction) {
    await interaction.deferReply();
    const query = interaction.options.getString('query');

    try {
        const response = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: `أنت كبير مهندسي الروبوتات والذكاء الاصطناعي. وظيفتك حل المشاكل التقنية وتطوير الأكواد لمجتمع الضاد. لديك خبرة في ${brain.lessons.length} مشكلة سابقة.` },
                { role: 'user', content: query }
            ],
            temperature: 0.7
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const answer = response.data.choices[0].message.content;

        // حفظ الدرس في الذاكرة للتعلم المستمر
        brain.lessons.push({ query, timestamp: new Date().toISOString() });
        updateBrain({ lessons: brain.lessons });

        await interaction.editReply(answer);
    } catch (err) {
        await interaction.editReply('❌ AI Engine timeout. Please try again.');
    }
}

// --- 2. وظيفة الـ Project (تحليل فيزيائي وبرمجي) ---
async function handleComplexProject(interaction) {
    await interaction.deferReply();
    const idea = interaction.options.getString('idea');
    const pId = `PROJ-${Date.now().toString(36).toUpperCase()}`;

    try {
        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'system',
                content: `Analyze the robot idea and return ONLY JSON: {"name": "Project Name", "logic": "Algorithm in Arabic", "physics": "Physical laws used in Arabic", "components": [{"n": "Component", "p": "Pin"}], "code": "C++ Arduino code"}`
            }, { role: 'user', content: idea }],
            temperature: 0.3
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        const data = JSON.parse(res.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);

        // تخزين المشروع في الذاكرة الدائمة
        brain.projects[pId] = data;
        updateBrain({ projects: brain.projects });

        const embed = new EmbedBuilder()
            .setTitle(`🚀 ${data.name} | ${pId}`)
            .setDescription(`**المنطق البرمجي:**\n${data.logic}\n\n**الأساس الفيزيائي:**\n${data.physics}`)
            .setColor(0x00FF00)
            .setFooter({ text: 'Ai KSU | Mujtama Al-Dhad' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`code_${pId}`).setLabel('Get Code').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`wiring_${pId}`).setLabel('Wiring Map').setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error(err);
        await interaction.editReply('❌ Failed to analyze the project idea.');
    }
}

// --- 3. وظيفة الـ Upgrade (تطوير وتغيير المكونات) ---
async function handleUpgrade(interaction) {
    await interaction.deferReply();
    const id = interaction.options.getString('id');
    const request = interaction.options.getString('request');
    const oldProject = brain.projects[id];

    if (!oldProject) return interaction.editReply('❌ Project ID not found in my brain.');

    try {
        const res = await axios.post(GROQ_API, {
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'system',
                content: `You are an upgrade engineer. Update this project: ${JSON.stringify(oldProject)} based on this user request: ${request}. Provide the new code and explain changes in Arabic.`
            }],
            temperature: 0.5
        }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });

        await interaction.editReply(`✅ **Upgrade for ${id} successful:**\n\n${res.data.choices[0].message.content.substring(0, 1900)}`);
    } catch (err) {
        await interaction.editReply('❌ Failed to process the upgrade.');
    }
}

// --- معالجة الأزرار ---
async function handleProjectButtons(interaction) {
    const [action, id] = interaction.customId.split('_');
    const p = brain.projects[id];

    if (!p) return interaction.reply({ content: '❌ Project data expired.', ephemeral: true });

    if (action === 'code') {
        const file = new AttachmentBuilder(Buffer.from(p.code), { name: `control_${id}.ino` });
        await interaction.reply({ content: '📄 **Arduino Code:**', files: [file], ephemeral: true });
    } else if (action === 'wiring') {
        let map = `⚡ **Wiring for ${p.name}:**\n`;
        p.components.forEach(c => map += `• ${c.n} ──> Pin ${c.p}\n`);
        await interaction.reply({ content: map, ephemeral: true });
    }
}

client.login(process.env.DISCORD_TOKEN);