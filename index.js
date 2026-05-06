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

// === APIs ===
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = process.env.GROQ_API_KEY;

// === Database ===
const DB_FILE = './projects.json';
let projects = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(projects, null, 2));
}

// === Slash Commands Definition ===
const commands = [
    {
        name: 'مشروع',
        nameLocalizations: { 'en-US': 'project' },
        description: 'ابدأ مشروع روبوت جديد من فكرتك',
        options: [{
            name: 'فكرة',
            type: 3,
            required: true,
            description: 'صف فكرتك بالكامل'
        }]
    },
    {
        name: 'help',
        description: 'عرض قائمة المساعدة'
    }
];

// === Ready Event ===
client.once('ready', async () => {
    console.log(`✅ Bot is online: ${client.user.tag}`);
    try {
        await client.application.commands.set(commands);
        console.log('✅ Commands registered');
        client.user.setActivity('🤖 /مشروع لبناء الروبوتات', { type: 4 });
    } catch (err) {
        console.error(err);
    }
});

// === Interaction Handler ===
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'مشروع') await handleProject(interaction);
    }
    else if (interaction.isButton()) {
        await handleButtons(interaction);
    }
});

// === Project Handler ===
async function handleProject(interaction) {
    await interaction.deferReply();
    const idea = interaction.options.getString('فكرة');
    const projectId = `P${Date.now().toString(36).toUpperCase()}`;

    try {
        const analysis = await analyzeIdea(idea);
        const components = await searchComponents(analysis.components);
        const code = await generateCode(idea, components, analysis.pinout, analysis.algorithm);

        projects[projectId] = {
            id: projectId, idea, analysis, components, code,
            userId: interaction.user.id, createdAt: new Date().toISOString()
        };
        saveDB();

        const embed = new EmbedBuilder()
            .setTitle(`🔧 ${analysis.name} | ${projectId}`)
            .setDescription(`**الوصف:**\n${analysis.description}`)
            .setColor(0x00AE86)
            .addFields(
                { name: '📊 الصعوبة', value: analysis.difficulty, inline: true },
                { name: '⚡ التوصيلات الأساسية', value: formatPinout(analysis.pinout), inline: true }
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`code_${projectId}`).setLabel('📄 الكود').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`sch_${projectId}`).setLabel('⚡ السكيماتيك').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`pcb_${projectId}`).setLabel('🔲 PCB').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`build_${projectId}`).setLabel('🔨 خطوات التجميع').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`datasheet_${projectId}`).setLabel('📚 داتا شيتس').setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
            content: `✅ **تم تحليل فكرتك بنجاح يا ${interaction.user.username}!**`,
            embeds: [embed],
            components: [row1, row2]
        });

    } catch (err) {
        console.error(err);
        await interaction.editReply('❌ فشل في معالجة الفكرة. تأكد من إعدادات الـ API.');
    }
}

// === Button Logic ===
async function handleButtons(interaction) {
    const [action, projectId] = interaction.customId.split('_');
    const project = projects[projectId];
    if (!project) return interaction.reply({ content: '❌ المشروع غير موجود.', ephemeral: true });

    switch (action) {
        case 'code':
            const attachment = new AttachmentBuilder(Buffer.from(project.code), { name: `code_${projectId}.ino` });
            await interaction.reply({ content: `📄 **كود الأردوينو لمشروع ${projectId}:**`, files: [attachment], ephemeral: true });
            break;
        case 'sch':
            const schText = generateSchematicText(project);
            await interaction.reply({ content: `⚡ **السكيماتيك التوضيحي:**\n\`\`\`\n${schText}\n\`\`\``, ephemeral: true });
            break;
        case 'build':
            const steps = generateBuildSteps(project);
            await interaction.reply({ content: steps, ephemeral: true });
            break;
        case 'datasheet':
            const links = project.components.map(c => `• **${c.name}**: [Datasheet](${c.datasheet})`).join('\n');
            await interaction.reply({ content: `📚 **روابط الداتا شيتس:**\n${links}`, ephemeral: true });
            break;
        case 'pcb':
            await interaction.reply({ content: `🔲 **ملف الـ Netlist لـ KiCad:**\n(قيد التطوير، استخدم السكيماتيك حالياً)`, ephemeral: true });
            break;
    }
}

// === AI Functions ===
async function analyzeIdea(idea) {
    const response = await axios.post(GROQ_API, {
        model: 'llama-3.3-70b-versatile',
        messages: [{
            role: 'system',
            content: `You are a robotics expert. Return ONLY JSON: {"name": "English/Arabic Name", "description": "Arabic Desc", "difficulty": "Easy/Medium/Hard", "components": [{"name": "CompName", "type": "sensor"}], "pinout": {"Comp": "Pin"}, "algorithm": "Arabic steps"}`
        }, { role: 'user', content: idea }],
        temperature: 0.3
    }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
    return JSON.parse(response.data.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
}

async function generateCode(idea, components, pinout, algorithm) {
    const response = await axios.post(GROQ_API, {
        model: 'llama-3.3-70b-versatile',
        messages: [{
            role: 'system',
            content: `Write Arduino code for this project with Arabic comments. Return ONLY code.`
        }, { role: 'user', content: `Idea: ${idea}, Pinout: ${JSON.stringify(pinout)}` }],
        temperature: 0.2
    }, { headers: { 'Authorization': `Bearer ${GROQ_KEY}` } });
    return response.data.choices[0].message.content;
}

// === Helper Functions ===
function formatPinout(pinout) {
    return Object.entries(pinout).map(([k, v]) => `• ${k} → ${v}`).join('\n');
}

function generateSchematicText(project) {
    let sch = '      [ARDUINO UNO]\n           │\n';
    Object.entries(project.analysis.pinout).forEach(([comp, pin]) => {
        sch += `   [${comp}] <───> (${pin})\n`;
    });
    sch += '           │\n         [GND]';
    return sch;
}

function generateBuildSteps(project) {
    let steps = `🔨 **خطوات بناء مشروع ${project.analysis.name}:**\n\n`;
    steps += `1. أحضر لوحة تجارب (Breadboard) وأسلاك توصيل.\n`;
    Object.entries(project.analysis.pinout).forEach(([comp, pin], i) => {
        steps += `${i + 2}. قم بتوصيل طرف الإشارة لـ **${comp}** بالمنفذ **${pin}** في الأردوينو.\n`;
    });
    steps += `${Object.keys(project.analysis.pinout).length + 2}. تأكد من توصيل كافة الأطراف السالبة بـ GND.\n`;
    steps += `\n✅ **مبروك!** ارفع الكود الآن وابدأ التجربة.`;
    return steps;
}

async function searchComponents(list) {
    return list.map(c => ({
        name: c.name,
        datasheet: `https://www.google.com/search?q=${encodeURIComponent(c.name)}+datasheet+pdf`,
        url: `https://www.amazon.com/s?k=${encodeURIComponent(c.name)}`
    }));
}

client.login(process.env.DISCORD_TOKEN);