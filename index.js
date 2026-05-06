require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
let learnedPatterns = [];

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(projects, null, 2));
}

// === Learning System ===
function learnFromProject(project) {
    if (project.rating >= 4) {
        learnedPatterns.push({
            idea: project.idea,
            components: project.components,
            timestamp: Date.now()
        });
    }
}

// === Slash Commands Definition ===
const commands = [
    {
        name: 'مشروع',
        nameLocalizations: { 'en-US': 'project' },
        description: 'ابدأ مشروع روبوت جديد',
        descriptionLocalizations: { 'en-US': 'Start a new robot project' },
        options: [{
            name: 'فكرة',
            nameLocalizations: { 'en-US': 'idea' },
            description: 'صف فكرتك بالعربية أو الإنجليزية',
            descriptionLocalizations: { 'en-US': 'Describe your idea in Arabic or English' },
            type: 3,
            required: true
        }]
    },
    {
        name: 'project',
        description: 'Start a new robot project',
        options: [{
            name: 'idea',
            description: 'Describe your idea',
            type: 3,
            required: true
        }]
    },
    {
        name: 'كود',
        nameLocalizations: { 'en-US': 'code' },
        description: 'اطلب كود لمشروع موجود',
        descriptionLocalizations: { 'en-US': 'Get code for existing project' },
        options: [{
            name: 'رقم',
            nameLocalizations: { 'en-US': 'id' },
            description: 'رقم المشروع',
            descriptionLocalizations: { 'en-US': 'Project ID' },
            type: 3,
            required: true
        }]
    },
    {
        name: 'code',
        description: 'Get code for existing project',
        options: [{
            name: 'id',
            description: 'Project ID',
            type: 3,
            required: true
        }]
    },
    {
        name: 'مكونات',
        nameLocalizations: { 'en-US': 'components' },
        description: 'ابحث عن مكونات إلكترونية',
        descriptionLocalizations: { 'en-US': 'Search for electronic components' },
        options: [{
            name: 'اسم',
            nameLocalizations: { 'en-US': 'name' },
            description: 'اسم المكون (مثال: Arduino Uno, HC-SR04)',
            descriptionLocalizations: { 'en-US': 'Component name (e.g., Arduino Uno, HC-SR04)' },
            type: 3,
            required: true
        }]
    },
    {
        name: 'components',
        description: 'Search for electronic components',
        options: [{
            name: 'name',
            description: 'Component name',
            type: 3,
            required: true
        }]
    },
    {
        name: 'طور',
        nameLocalizations: { 'en-US': 'upgrade' },
        description: 'طور مشروع قائم بإضافة ميزة جديدة',
        descriptionLocalizations: { 'en-US': 'Upgrade existing project with new feature' },
        options: [
            {
                name: 'رقم',
                nameLocalizations: { 'en-US': 'id' },
                description: 'رقم المشروع',
                descriptionLocalizations: { 'en-US': 'Project ID' },
                type: 3,
                required: true
            },
            {
                name: 'اضافة',
                nameLocalizations: { 'en-US': 'feature' },
                description: 'ايه اللي عايز تضيفه؟',
                descriptionLocalizations: { 'en-US': 'What feature to add?' },
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'upgrade',
        description: 'Upgrade existing project with new feature',
        options: [
            {
                name: 'id',
                description: 'Project ID',
                type: 3,
                required: true
            },
            {
                name: 'feature',
                description: 'Feature to add',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'تعلم',
        nameLocalizations: { 'en-US': 'learn' },
        description: 'قيّم مشروع وساعد البوت يتعلم',
        descriptionLocalizations: { 'en-US': 'Rate project and help bot learn' },
        options: [
            {
                name: 'رقم',
                nameLocalizations: { 'en-US': 'id' },
                description: 'رقم المشروع',
                descriptionLocalizations: { 'en-US': 'Project ID' },
                type: 3,
                required: true
            },
            {
                name: 'تقييم',
                nameLocalizations: { 'en-US': 'rating' },
                description: 'من 1 لـ 5',
                descriptionLocalizations: { 'en-US': 'From 1 to 5' },
                type: 4,
                required: true,
                minValue: 1,
                maxValue: 5
            },
            {
                name: 'ملاحظات',
                nameLocalizations: { 'en-US': 'notes' },
                description: 'ملاحظاتك (اختياري)',
                descriptionLocalizations: { 'en-US': 'Your notes (optional)' },
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'learn',
        description: 'Rate project and help bot learn',
        options: [
            {
                name: 'id',
                description: 'Project ID',
                type: 3,
                required: true
            },
            {
                name: 'rating',
                description: 'From 1 to 5',
                type: 4,
                required: true,
                minValue: 1,
                maxValue: 5
            },
            {
                name: 'notes',
                description: 'Your notes (optional)',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'مساعدة',
        nameLocalizations: { 'en-US': 'help' },
        description: 'عرض كل الأوامر المتاحة',
        descriptionLocalizations: { 'en-US': 'Show all available commands' }
    },
    {
        name: 'help',
        description: 'Show all available commands'
    }
];

// === Ready Event ===
client.once('ready', async () => {
    console.log(`✅ Bot is online: ${client.user.tag}`);

    try {
        // Register commands globally
        await client.application.commands.set(commands);
        console.log('✅ Commands registered globally');

        // Set bot activity
        client.user.setActivity('🤖 /مشروع أو /project', { type: 4 });
    } catch (err) {
        console.error('Error registering commands:', err);
    }
});

// === Command Handler ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;

    try {
        // Handle Arabic and English project commands
        if (commandName === 'مشروع' || commandName === 'project') {
            await handleProject(interaction);
        }
        // Handle code commands
        else if (commandName === 'كود' || commandName === 'code') {
            await handleCode(interaction);
        }
        // Handle component search
        else if (commandName === 'مكونات' || commandName === 'components') {
            await handleComponents(interaction);
        }
        // Handle upgrade
        else if (commandName === 'طور' || commandName === 'upgrade') {
            await handleUpgrade(interaction);
        }
        // Handle learning/feedback
        else if (commandName === 'تعلم' || commandName === 'learn') {
            await handleLearn(interaction);
        }
        // Handle help
        else if (commandName === 'مساعدة' || commandName === 'help') {
            await handleHelp(interaction);
        }
    } catch (err) {
        console.error('Command error:', err);
        const errorMsg = '❌ حصل خطأ غير متوقع. جرب تاني.\n❌ An unexpected error occurred. Please try again.';

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMsg }).catch(() => { });
        } else {
            await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => { });
        }
    }
});

// === Button Handler ===
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const [action, projectId] = interaction.customId.split('_');
    const project = projects[projectId];

    if (!project) {
        return interaction.reply({
            content: '❌ المشروع مش موجود.\n❌ Project not found.',
            ephemeral: true
        });
    }

    try {
        switch (action) {
            case 'code':
                await sendCodeFile(interaction, project);
                break;
            case 'sch':
                await sendSchematic(interaction, project);
                break;
            case 'pcb':
                await sendPCB(interaction, project);
                break;
            case 'build':
                await sendBuildSteps(interaction, project);
                break;
            case 'datasheet':
                await sendDatasheets(interaction, project);
                break;
        }
    } catch (err) {
        console.error('Button error:', err);
        await interaction.reply({
            content: '❌ حصل خطأ. جرب تاني.\n❌ An error occurred.',
            ephemeral: true
        });
    }
});

// === Project Handler ===
async function handleProject(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const idea = interaction.options.getString('فكرة') || interaction.options.getString('idea');
    const projectId = `P${Date.now().toString(36).toUpperCase()}`;

    // Show processing message
    await interaction.editReply({
        content: '⏳ جاري تحليل فكرة المشروع...\n⏳ Analyzing project idea...'
    });

    try {
        // 1. Analyze idea with AI
        const analysis = await analyzeIdea(idea);

        // 2. Search for components
        const components = await searchComponents(analysis.components);

        // 3. Generate code
        const code = await generateCode(idea, components, analysis.pinout, analysis.algorithm);

        // 4. Save project
        projects[projectId] = {
            id: projectId,
            userId: interaction.user.id,
            username: interaction.user.username,
            guildId: interaction.guildId,
            idea,
            analysis,
            components,
            code,
            createdAt: new Date().toISOString(),
            rating: 0,
            iterations: 1,
            feedback: ''
        };
        saveDB();

        // 5. Build response embed
        const embed = new EmbedBuilder()
            .setTitle(`🔧 ${analysis.name} | ${projectId}`)
            .setDescription(`**الفكرة | Idea:**\n${idea}\n\n**الوصف | Description:**\n${analysis.description}`)
            .setColor(0x00AE86)
            .addFields(
                {
                    name: '📊 الصعوبة | Difficulty',
                    value: analysis.difficulty,
                    inline: true
                },
                {
                    name: '⚡ التوصيلات | Pinout',
                    value: formatPinout(analysis.pinout),
                    inline: true
                }
            );

        // Add physics if available
        if (analysis.physics && analysis.physics !== 'لا يوجد') {
            embed.addFields({
                name: '🧮 الفيزياء | Physics',
                value: analysis.physics.substring(0, 1000),
                inline: false
            });
        }

        // Add algorithm
        if (analysis.algorithm) {
            embed.addFields({
                name: '📋 الخوارزمية | Algorithm',
                value: analysis.algorithm.substring(0, 1000),
                inline: false
            });
        }

        // Add components (max 25 fields limit)
        const compFields = components.slice(0, 10).map(c => ({
            name: `🔌 ${c.name}`,
            value: `**النوع | Type:** ${c.type}\n**السعر | Price:** ${c.price || '?'}\n**[📄 داتا شيت](${c.datasheet})** | **[🛒 شراء](${c.url})**`,
            inline: true
        }));

        embed.addFields(compFields);

        embed.setFooter({
            text: `بواسطة | By: ${interaction.user.username} | اضغط الأزرار | Click buttons below`
        });
        embed.setTimestamp();

        // Create buttons
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`code_${projectId}`)
                    .setLabel('📄 الكود | Code')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`sch_${projectId}`)
                    .setLabel('⚡ السكيماتيك | Schematic')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`pcb_${projectId}`)
                    .setLabel('🔲 PCB')
                    .setStyle(ButtonStyle.Secondary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`build_${projectId}`)
                    .setLabel('🔨 خطوات التجميع | Build Steps')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`datasheet_${projectId}`)
                    .setLabel('📚 كل الداتا شيتس | All Datasheets')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            content: `✅ **تم إنشاء المشروع | Project Created: ${projectId}**`,
            embeds: [embed],
            components: [row1, row2]
        });

    } catch (err) {
        console.error('Project creation error:', err);
        await interaction.editReply({
            content: '❌ فشل في إنشاء المشروع. جرب تاني.\n❌ Failed to create project. Please try again.'
        });
    }
}

// === Code Handler ===
async function handleCode(interaction) {
    const projectId = interaction.options.getString('رقم') || interaction.options.getString('id');
    const project = projects[projectId];

    if (!project) {
        return interaction.reply({
            content: '❌ المشروع مش موجود. تأكد من الرقم.\n❌ Project not found. Check the ID.',
            ephemeral: true
        });
    }

    await sendCodeFile(interaction, project, true);
}

async function sendCodeFile(interaction, project, isCommand = false) {
    const codeBuffer = Buffer.from(project.code, 'utf-8');
    const extension = project.code.includes('void setup()') ? 'ino' :
        project.code.includes('import') ? 'py' : 'cpp';

    const attachment = new AttachmentBuilder(codeBuffer, {
        name: `${project.id}_code.${extension}`
    });

    const content = `📄 **كود المشروع | Project Code: ${project.id}**\n\n**الفكرة | Idea:** ${project.idea}`;

    if (isCommand) {
        await interaction.reply({ content, files: [attachment], ephemeral: true });
    } else {
        await interaction.reply({ content, files: [attachment], ephemeral: true });
    }
}

// === Components Handler ===
async function handleComponents(interaction) {
    await interaction.deferReply();

    const name = interaction.options.getString('اسم') || interaction.options.getString('name');

    try {
        const results = await searchComponents([{
            name,
            type: 'component',
            searchQuery: name
        }]);

        const embed = new EmbedBuilder()
            .setTitle(`🔍 نتائج البحث | Search Results: ${name}`)
            .setColor(0x0099FF)
            .setDescription(`تم العثور على | Found: ${results.length} مكون | component(s)`);

        results.slice(0, 10).forEach((c, i) => {
            embed.addFields({
                name: `${i + 1}. ${c.name}`,
                value: `**النوع | Type:** ${c.type}\n**السعر | Price:** ${c.price || '?'}\n**[📄 داتا شيت](${c.datasheet})** | **[🛒 شراء](${c.url})**`,
                inline: true
            });
        });

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error('Components search error:', err);
        await interaction.editReply({
            content: '❌ فشل البحث. جرب اسم تاني.\n❌ Search failed. Try another name.'
        });
    }
}

// === Upgrade Handler ===
async function handleUpgrade(interaction) {
    await interaction.deferReply();

    const projectId = interaction.options.getString('رقم') || interaction.options.getString('id');
    const feature = interaction.options.getString('اضافة') || interaction.options.getString('feature');
    const project = projects[projectId];

    if (!project) {
        return interaction.editReply('❌ المشروع مش موجود.\n❌ Project not found.');
    }

    try {
        await interaction.editReply({
            content: '⏳ جاري تطوير المشروع...\n⏳ Upgrading project...'
        });

        const upgraded = await upgradeProject(project, feature);

        const newId = `${projectId}_V${project.iterations + 1}`;
        projects[newId] = {
            ...project,
            id: newId,
            idea: `${project.idea} + ${feature}`,
            code: upgraded.code,
            components: [...project.components, ...(upgraded.newComponents || [])],
            iterations: project.iterations + 1,
            parentId: projectId,
            upgradeFeature: feature
        };
        saveDB();

        const embed = new EmbedBuilder()
            .setTitle(`🚀 النسخة المطورة | Upgraded: ${newId}`)
            .setDescription(`**الإضافة | Feature:** ${feature}`)
            .setColor(0xFFD700)
            .addFields(
                { name: 'المشروع الأصلي | Original', value: projectId, inline: true },
                { name: 'عدد التطويرات | Iterations', value: String(projects[newId].iterations), inline: true }
            );

        if (upgraded.newComponents && upgraded.newComponents.length > 0) {
            embed.addFields(
                upgraded.newComponents.map(c => ({
                    name: `➕ ${c.name}`,
                    value: `${c.description || c.type}\n**[داتا شيت](${c.datasheet || '#'})**`,
                    inline: true
                }))
            );
        }

        // Add code preview
        embed.addFields({
            name: '💻 الكود المطور | Upgraded Code',
            value: `\`\`\`cpp\n${upgraded.code.substring(0, 500)}...\n\`\`\``
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`code_${newId}`)
                    .setLabel('📄 الكود الجديد | New Code')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.editReply({
            content: `✅ **تم التطوير | Upgrade Complete: ${newId}**`,
            embeds: [embed],
            components: [row]
        });

    } catch (err) {
        console.error('Upgrade error:', err);
        await interaction.editReply('❌ فشل التطوير. جرب تاني.\n❌ Upgrade failed. Please try again.');
    }
}

// === Learn Handler ===
async function handleLearn(interaction) {
    const projectId = interaction.options.getString('رقم') || interaction.options.getString('id');
    const rating = interaction.options.getInteger('تقييم') || interaction.options.getInteger('rating');
    const notes = interaction.options.getString('ملاحظات') || interaction.options.getString('notes') || '';
    const project = projects[projectId];

    if (!project) {
        return interaction.reply({
            content: '❌ المشروع مش موجود.\n❌ Project not found.',
            ephemeral: true
        });
    }

    // Update rating
    project.rating = rating;
    project.feedback = notes;
    saveDB();

    // Learn if rating is high
    let learned = false;
    if (rating >= 4) {
        learnFromProject(project);
        learned = true;
    }

    const embed = new EmbedBuilder()
        .setTitle(`📊 تقييم المشروع | Project Rating: ${projectId}`)
        .setColor(rating >= 4 ? 0x00FF00 : rating >= 3 ? 0xFFFF00 : 0xFF0000)
        .addFields(
            { name: 'التقييم | Rating', value: '⭐'.repeat(rating), inline: true },
            { name: 'الملاحظات | Notes', value: notes || 'لا يوجد | None', inline: false }
        );

    if (learned) {
        embed.setDescription('🧠 **البوت اتعلم من المشروع ده!**\n🧠 **Bot learned from this project!**');
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// === Help Handler ===
async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🤖 Ai ksu - دليل الأوامر | Command Guide')
        .setDescription('مساعدك الذكي في مشاريع الروبوتات والإلكترونيات\nYour AI assistant for robotics and electronics projects')
        .setColor(0x7289DA)
        .addFields(
            {
                name: '🚀 إنشاء مشروع | Create Project',
                value: '`/مشروع فكرة:...` أو `or` `/project idea:...`\nابدأ مشروع جديد من فكرتك',
                inline: false
            },
            {
                name: '💻 الحصول على كود | Get Code',
                value: '`/كود رقم:PXXX` أو `or` `/code id:PXXX`\nاحصل على كود مشروع موجود',
                inline: false
            },
            {
                name: '🔍 البحث عن مكونات | Search Components',
                value: '`/مكونات اسم:...` أو `or` `/components name:...`\nابحث عن مكونات إلكترونية وداتا شيتس',
                inline: false
            },
            {
                name: '🚀 تطوير مشروع | Upgrade Project',
                value: '`/طور رقم:PXXX اضافة:...` أو `or` `/upgrade id:PXXX feature:...`\nطور مشروع قائم بإضافة ميزات جديدة',
                inline: false
            },
            {
                name: '📊 التقييم والتعلم | Rate & Learn',
                value: '`/تعلم رقم:PXXX تقييم:5` أو `or` `/learn id:PXXX rating:5`\nساعد البوت يتحسن بتقييم المشاريع',
                inline: false
            },
            {
                name: '❓ المساعدة | Help',
                value: '`/مساعدة` أو `or` `/help`\nعرض هذا الدليل',
                inline: false
            }
        )
        .setFooter({ text: 'Ai ksu - Powered by Groq AI' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// === Schematic Handler ===
async function sendSchematic(interaction, project) {
    const schematic = generateSchematicText(project);

    await interaction.reply({
        content: `⚡ **السكيماتيك المبسط | Simplified Schematic: ${project.id}**`,
        embeds: [new EmbedBuilder()
            .setDescription(`\`\`\`\n${schematic}\n\`\`\``)
            .setColor(0x00FF00)
        ],
        ephemeral: true
    });
}

// === PCB Handler ===
async function sendPCB(interaction, project) {
    const netlist = generateNetlist(project);
    const buffer = Buffer.from(netlist, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${project.id}.net` });

    await interaction.reply({
        content: `🔲 **ملف PCB (Netlist): ${project.id}**\n\nيمكن فتحه في KiCad | Can be opened in KiCad`,
        files: [attachment],
        ephemeral: true
    });
}

// === Build Steps Handler ===
async function sendBuildSteps(interaction, project) {
    const steps = generateBuildSteps(project);

    await interaction.reply({
        content: steps,
        ephemeral: true
    });
}

// === Datasheets Handler ===
async function sendDatasheets(interaction, project) {
    let links = project.components.map(c =>
        `• **${c.name}**: [داتا شيت | Datasheet](${c.datasheet}) | [شراء | Buy](${c.url})`
    ).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`📚 كل الداتا شيتس | All Datasheets: ${project.id}`)
        .setDescription(links)
        .setColor(0x0099FF);

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// === AI Functions ===
async function analyzeIdea(idea) {
    const response = await axios.post(GROQ_API, {
        model: 'deepseek-coder-33b',
        messages: [{
            role: 'system',
            content: `You are an expert robotics engineer. Analyze the project idea and return ONLY a JSON object with this structure:
            {
                "name": "Project name in Arabic and English",
                "description": "Detailed description in Arabic and English",
                "difficulty": "سهل | Easy / متوسط | Medium / صعب | Hard",
                "components": [
                    {"name": "Component name", "type": "sensor|actuator|mcu|power|communication", "searchQuery": "search term for this component"}
                ],
                "pinout": {"component_name": "Arduino pin"},
                "algorithm": "Step-by-step algorithm in Arabic",
                "physics": "Relevant physics equations and calculations in Arabic"
            }
            Be specific with real component names like Arduino Uno, HC-SR04, L298N, etc.`
        }, {
            role: 'user',
            content: idea
        }],
        temperature: 0.3,
        max_tokens: 2000
    }, {
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
    });

    const content = response.data.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid JSON response from AI');
}

async function searchComponents(componentsList) {
    const results = [];

    for (const comp of componentsList) {
        try {
            // Try to get real component data from SnapEDA-like API
            // For now, generate realistic component info
            const componentData = await getComponentData(comp.searchQuery || comp.name);
            results.push(componentData);
        } catch {
            results.push({
                name: comp.name,
                type: comp.type,
                price: getEstimatedPrice(comp.name),
                datasheet: `https://www.google.com/search?q=${encodeURIComponent(comp.name)}+datasheet+pdf`,
                url: `https://www.amazon.com/s?k=${encodeURIComponent(comp.name)}`,
                description: `${comp.type} component for robotics projects`
            });
        }
    }

    return results;
}

async function getComponentData(query) {
    // This would ideally call SnapEDA/Octopart API
    // For now, return structured data with search links
    return {
        name: query,
        type: 'component',
        price: getEstimatedPrice(query),
        datasheet: `https://www.google.com/search?q=${encodeURIComponent(query)}+datasheet+pdf`,
        url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
        description: `Search results for ${query}`
    };
}

function getEstimatedPrice(name) {
    const prices = {
        'arduino': '$15-25',
        'sensor': '$2-10',
        'motor': '$5-20',
        'servo': '$3-15',
        'bluetooth': '$5-15',
        'wifi': '$3-10',
        'camera': '$10-50',
        'lcd': '$5-20',
        'ultrasonic': '$2-5',
        'ir': '$1-3'
    };

    const lower = name.toLowerCase();
    for (const [key, price] of Object.entries(prices)) {
        if (lower.includes(key)) return price;
    }
    return '$5-15';
}

async function generateCode(idea, components, pinout, algorithm) {
    const response = await axios.post(GROQ_API, {
        model: 'deepseek-coder-33b',
        messages: [{
            role: 'system',
            content: `You are an expert Arduino/embedded systems programmer. Write complete, working code with:
            - Arabic comments explaining each section
            - Error handling
            - OOP structure for complex projects
            - Clear pin definitions
            - Serial debugging output
            Return ONLY the code, no explanations.`
        }, {
            role: 'user',
            content: `Project: ${idea}\nComponents: ${JSON.stringify(components)}\nPinout: ${JSON.stringify(pinout)}\nAlgorithm: ${algorithm}`
        }],
        temperature: 0.2,
        max_tokens: 3000
    }, {
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
    });

    return response.data.choices[0].message.content;
}

async function upgradeProject(project, feature) {
    const response = await axios.post(GROQ_API, {
        model: 'deepseek-coder-33b',
        messages: [{
            role: 'system',
            content: `You are a robotics upgrade specialist. Upgrade the project by adding the requested feature. Return ONLY a JSON object:
            {
                "code": "complete upgraded code",
                "newComponents": [
                    {"name": "new component", "type": "type", "description": "why needed", "datasheet": "search link"}
                ]
            }`
        }, {
            role: 'user',
            content: `Original project: ${project.idea}\nOriginal code: ${project.code.substring(0, 1000)}\nFeature to add: ${feature}`
        }],
        temperature: 0.3,
        max_tokens: 3000
    }, {
        headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }
    });

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }

    // Fallback: return upgraded code only
    return {
        code: content,
        newComponents: []
    };
}

// === Helper Functions ===
function generateSchematicText(project) {
    let schematic = '⚡ السكيماتيك المبسط | Simplified Schematic:\n';
    schematic += '═══════════════════════════════════════\n\n';
    schematic += '           [ARDUINO UNO]\n';
    schematic += '                │\n';
    schematic += '      ┌─────────┼─────────┐\n';
    schematic += '      │         │         │\n';

    project.components.forEach((c, i) => {
        const pin = project.analysis?.pinout?.[c.name] || `D${i + 2}`;
        schematic += `      │\n`;
        schematic += `   [${c.name}]\n`;
        schematic += `      │\n`;
        schematic += `    (${pin})\n`;
        schematic += `      │\n`;
    });

    schematic += '      │\n';
    schematic += '     GND\n\n';
    schematic += '═══════════════════════════════════════\n';
    schematic += 'ملاحظة: ده سكيماتيك مبسط. استخدم KiCad للتصميم النهائي.\n';
    schematic += 'Note: This is a simplified schematic. Use KiCad for final design.';

    return schematic;
}

function generateNetlist(project) {
    let netlist = `* Netlist for ${project.id}\n`;
    netlist += `* ${project.idea}\n`;
    netlist += `* Generated by Ai ksu Bot\n`;
    netlist += `* Date: ${new Date().toISOString()}\n\n`;

    netlist += '# Components\n';
    project.components.forEach((c, i) => {
        netlist += `COMP ${i + 1} ${c.name.replace(/\s/g, '_')} ${c.type.toUpperCase()}\n`;
    });

    netlist += '\n# Connections\n';
    if (project.analysis?.pinout) {
        Object.entries(project.analysis.pinout).forEach(([comp, pin]) => {
            netlist += `NET ${comp.replace(/\s/g, '_')} ${pin}\n`;
        });
    }

    netlist += '\n# Power\n';
    netlist += 'NET VCC 5V\n';
    netlist += 'NET GND GND\n\n';
    netlist += '* END\n';

    return netlist;
}

function generateBuildSteps(project) {
    let steps = `🔨 **خطوات تجميع المشروع | Build Steps: ${project.id}**\n\n`;

    steps += '**🛠️ الأدوات المطلوبة | Required Tools:**\n';
    steps += '• Soldering iron (محطة لحام)\n';
    steps += '• Breadboard (لوحة تجارب)\n';
    steps += '• Jumper wires (أسلاك توصيل)\n';
    steps += '• Multimeter (أفوميتر) - اختياري\n\n';

    steps += '**📋 خطوات التجميع | Assembly Steps:**\n';
    project.components.forEach((c, i) => {
        const pin = project.analysis?.pinout?.[c.name] || 'Arduino';
        steps += `${i + 1}. وصل **${c.name}** مع **${pin}**\n`;
        steps += `   Connect **${c.name}** to **${pin}**\n\n`;
    });

    steps += '**✅ الاختبار | Testing:**\n';
    steps += '1. افتح Arduino IDE (أو VS Code)\n';
    steps += '2. ارفع الكود على Arduino\n';
    steps += '3. افتح Serial Monitor (9600 baud)\n';
    steps += '4. تأكد من القراءات والاستجابة\n\n';

    steps += '**⚠️ نصائح السلامة | Safety Tips:**\n';
    steps += '• افصل الطاقة قبل التعديل\n';
    steps += '• تأكد من توصيل GND بشكل صحيح\n';
    steps += '• لا تتجاوز 5V على مدخلات Arduino\n';

    return steps;
}

function formatPinout(pinout) {
    if (!pinout || Object.keys(pinout).length === 0) return 'غير محدد | Not specified';
    return Object.entries(pinout)
        .map(([k, v]) => `${k} → ${v}`)
        .join('\n');
}

// === Error Handling ===
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// === Login ===
client.login(process.env.DISCORD_TOKEN);
