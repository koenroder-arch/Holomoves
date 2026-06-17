// API configuratie is nu beveiligd via de server (server.js + .env)
const CHAT_PROXY_URL = "/api/chat";

const chatViewport = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');

// 1. Chatbot Config & State
let faqData = [];
let bigDataFAQ = [];
let gamesData = [];
let configData = [];
let chatHistory = [];
let userQuestionCount = 0; // Telt het aantal gestelde vragen
let themeHistory = []; // Houdt de thema-historie bij voor escalatie-logica
let systemPromptTemplate = ""; // Wordt geladen uit bestand
let detectedLanguage = 'nl'; // Standaardtaal is Nederlands
const CSV_FILE_PATH = "Vragen en antwoorden ChatBot CSV.csv";
const BIG_DATA_FILE_PATH = "Big data vragen.csv";
const GAMES_FILE_PATH = "Spelvragen.csv";
const CONFIG_FILE_PATH = "Chatbot_Configuratie_HoloMoves.csv";
const PROMPT_FILE_PATH = "system_prompt.txt";
const SUGGESTIONS = [
    "Hoe maak ik de Quest schoon?",
    "Hoe werkt het casten?",
    "Waarom doet het recenteren het niet?",
    "Hoeveel ruimte heb ik nodig?"
];

const FOLLOW_UP_MESSAGES = {
    nl: [
        "Heeft u verder nog vragen?",
        "Kan ik u ergens anders mee helpen?",
        "Is er nog iets waarbij ik u van dienst kan zijn?",
        "Hebt u nog andere vragen over HoloMoves?",
        "Wilt u nog iets anders weten?",
        "Kan ik u nog ergens bij ondersteunen?",
        "Zijn er nog onduidelijkheden waar ik bij kan helpen?"
    ],
    en: [
        "Do you have any further questions?",
        "Can I help you with anything else?",
        "Is there anything else I can do for you?",
        "Do you have other questions about HoloMoves?",
        "Would you like to know anything else?",
        "Can I support you with anything else?",
        "Are there any other points I can help clarify?"
    ],
    de: [
        "Haben Sie noch weitere Fragen?",
        "Kann ich Ihnen mit etwas anderem helfen?",
        "Gibt es noch etwas, bei dem ich Ihnen behilflich sein kann?",
        "Haben Sie noch andere Fragen zu HoloMoves?",
        "Möchten Sie noch etwas anderes wissen?",
        "Kann ich Sie noch bei etwas anderem unterstützen?",
        "Gibt es noch Unklarheiten, bei denen ich helfen kann?"
    ]
};

// Functie om de taal te detecteren op basis van de eerste gebruikersinvoer
function detectLanguage(text) {
    const cleanText = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
    const words = cleanText.split(/\s+/);
    
    const enWords = new Set(['the', 'you', 'how', 'what', 'where', 'why', 'are', 'with', 'about', 'clean', 'recentering', 'need', 'have', 'can', 'please', 'help', 'hello', 'about', 'your', 'my']);
    const deWords = new Set(['der', 'die', 'das', 'und', 'ist', 'sie', 'es', 'ich', 'wie', 'was', 'wo', 'warum', 'mit', 'uber', 'über', 'reinigen', 'zentrieren', 'brauche', 'haben', 'kann', 'bitte', 'hilfe', 'hallo', 'mein', 'dein', 'ihr']);
    const nlWords = new Set(['de', 'het', 'een', 'en', 'is', 'ik', 'hoe', 'wat', 'waar', 'waarom', 'met', 'over', 'ruimte', 'schoonmaken', 'recentreren', 'nodig', 'hebben', 'kan', 'je', 'u', 'hulp', 'hallo', 'mijn', 'jouw', 'uw']);
    
    let enScore = 0;
    let deScore = 0;
    let nlScore = 0;
    
    for (const word of words) {
        if (enWords.has(word)) enScore++;
        if (deWords.has(word)) deScore++;
        if (nlWords.has(word)) nlScore++;
    }
    
    if (enScore > nlScore && enScore > deScore) {
        return 'en';
    } else if (deScore > nlScore && deScore > enScore) {
        return 'de';
    } else {
        return 'nl';
    }
}

// 2. Functie om CSV te laden en te parsen
async function loadFAQData() {
    try {
        // Laad alle CSV's en bestanden
        const [faqRes, bigDataRes, gamesRes, configRes, promptRes] = await Promise.all([
            fetch(CSV_FILE_PATH),
            fetch(BIG_DATA_FILE_PATH),
            fetch(GAMES_FILE_PATH),
            fetch(CONFIG_FILE_PATH),
            fetch(PROMPT_FILE_PATH)
        ]);

        const [faqText, bigDataText, gamesText, configText, promptText] = await Promise.all([
            faqRes.text(),
            bigDataRes.text(),
            gamesRes.text(),
            configRes.text(),
            promptRes.text()
        ]);

        systemPromptTemplate = promptText;
        
        // 1. Standaard FAQ Parser
        const faqLines = faqText.split('\n').filter(line => line.trim() !== '');
        const faqHeaders = faqLines[0].split(';').map(h => h.trim());
        faqData = faqLines.slice(1).map(line => {
            const values = line.split(';').map(v => v.trim());
            const entry = {};
            faqHeaders.forEach((header, i) => { if (values[i]) entry[header] = values[i]; });
            return entry;
        }).filter(entry => entry.Vraag && entry.Antwoord);

        // 2. Big Data FAQ Parser (met multiline support voor bijlages)
        const bigDataLines = bigDataText.split('\n').filter(line => line.trim() !== '');
        let lastEntry = null;
        bigDataFAQ = [];
        bigDataLines.slice(1).forEach(line => {
            const values = line.split(';').map(v => v.trim());
            if (values[0]) {
                lastEntry = { Vraag: values[0], Antwoord: values[1] };
                bigDataFAQ.push(lastEntry);
            } else if (lastEntry && values[1]) {
                // Als de eerste kolom leeg is, hoort de informatie bij de vorige vraag
                if (values[1].match(/\.(mp4|pdf|pptx|docx|jpg|png)$/i)) {
                    lastEntry.Bestand = values[1];
                } else {
                    lastEntry.Antwoord += " " + values[1];
                }
            }
        });

        // 3. Spelvragen Parser
        const gamesLines = gamesText.split('\n').filter(line => line.trim() !== '');
        const gamesHeaders = gamesLines[0].split(';').map(h => h.trim());
        gamesData = gamesLines.slice(1).map(line => {
            const values = line.split(';').map(v => v.trim());
            const entry = {};
            gamesHeaders.forEach((header, i) => { if (values[i]) entry[header] = values[i]; });
            return entry;
        }).filter(entry => entry.Spel);

        // 4. Config Parser
        const configLines = configText.split('\n').filter(line => line.trim() !== '');
        const configHeaders = configLines[0].split(';').map(h => h.trim());
        configData = configLines.slice(1).map(line => {
            const values = line.split(';').map(v => v.trim());
            const entry = {};
            configHeaders.forEach((header, i) => { if (values[i]) entry[header] = values[i]; });
            return entry;
        }).filter(entry => entry.Type && entry.Onderwerp);

        console.log("Data geladen:", faqData.length, "FAQ,", bigDataFAQ.length, "BigData,", gamesData.length, "Games,", configData.length, "Config.");
    } catch (error) {
        console.error("Fout bij laden data:", error);
    }
}

// 3. Functie voor lokale matching (Level 1 van de RAG-workflow)
function findLocalMatch(userQuery) {
    const query = userQuery.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(w => w.length > 3);
    
    // Doorzoek beide FAQ bronnen
    const allFAQ = [...faqData, ...bigDataFAQ];
    
    for (const item of allFAQ) {
        const question = item.Vraag.toLowerCase();
        
        // 1. Exacte match of bevat de hele vraag
        if (question.includes(query) || query.includes(question)) {
            return { antwoord: item.Antwoord, bestand: item.Bestand };
        }
        
        // 2. Keyword overlap
        if (queryWords.length > 0) {
            const matchCount = queryWords.filter(word => question.includes(word)).length;
            const matchRatio = matchCount / queryWords.length;
            
            if (matchRatio >= 0.8) { 
                return { antwoord: item.Antwoord, bestand: item.Bestand };
            }
        }
    }
    return null;
}

// 4. Thema bepalen en loggen (Nieuw voor statistieken)
function determineTheme(text) {
    const t = text.toLowerCase();
    
    // Commercieel & Kosten
    if (t.includes("kost") || t.includes("prijs") || t.includes("licentie") || t.includes("pakket") || 
        t.includes("duur") || t.includes("betalen") || t.includes("geld") || t.includes("kopen") || 
        t.includes("aanschaf") || t.includes("abonnement") || t.includes("offerte")) return "Commercieel";
    
    // Ruimte & Oppervlakte
    if (t.includes("oppervlakte") || t.includes("ruimte") || t.includes("meter") || t.includes("afmeting") || 
        t.includes("plek") || t.includes("groot") || t.includes("vierkante")) return "Ruimte";
    
    // Technisch & Support (Software/Functionaliteit)
    if (t.includes("casten") || t.includes("wifi") || t.includes("verbinding") || t.includes("recenteren") || 
        t.includes("meta knop") || t.includes("fout") || t.includes("error") || t.includes("doet het niet") || 
        t.includes("beeld") || t.includes("geluid") || t.includes("haperen")) return "Technisch";
    
    // Hardware & Onderhoud
    if (t.includes("schoon") || t.includes("onderhoud") || t.includes("strap") || t.includes("vizor") || 
        t.includes("hardware") || t.includes("bril") || t.includes("headset") || t.includes("quest") || 
        t.includes("controller") || t.includes("batterij")) return "Hardware";
    
    // Medisch & Revalidatie
    if (t.includes("pijn") || t.includes("last") || t.includes("rug") || t.includes("knie") || 
        t.includes("revalidatie") || t.includes("oefening") || t.includes("therapie") || 
        t.includes("arts") || t.includes("dokter") || t.includes("fysio") || t.includes("medisch")) return "Medisch/Fysiek";

    // Bedrijfsinformatie
    if (t.includes("missie") || t.includes("visie") || t.includes("wat is") || t.includes("wie") || 
        t.includes("waarom") || t.includes("holomoves")) return "Bedrijfsinformatie";

    return "Algemeen/Overig";
}

async function logQuestion(vraag, thema) {
    try {
        await fetch('/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vraag, thema })
        });
    } catch (e) {
        console.error("Logging mislukt:", e);
    }
}

// 5. Systeeminstructies bouwen op basis van de vraag (Level 2)
function getDynamicSystemPrompt(userQuery) {
    let categorySpecificInstruction = "";
    let systemInstructions = "";
    let contactInfo = "";
    
    const qLower = userQuery.toLowerCase();
    const currentTheme = determineTheme(userQuery);
    
    // 1. Directe vraag om contact?
    const asksDirectlyForContact = qLower.includes("contact") || 
                                   qLower.includes("telefoon") || 
                                   qLower.includes("bellen") || 
                                   qLower.includes("mail") || 
                                   qLower.includes("spreken") || 
                                   qLower.includes("hulp nodig van een mens");

    // 2. Thema-herhaling check (3x hetzelfde thema?)
    const themeOccurrences = themeHistory.filter(t => t === currentTheme && t !== "Algemeen/Overig").length;
    
    // 3. Totaal aantal vragen check (Na 3 vragen)
    const totalQuestions = themeHistory.length; // themeHistory.length bevat ook de huidige vraag al
    
    const isEscalationAllowed = asksDirectlyForContact || themeOccurrences >= 3 || totalQuestions >= 3;
    
    // Verwerk ConfigData voor dynamische instructies
    for (const config of configData) {
        if (config.Type === 'Systeem Instructie') {
            systemInstructions += `- ${config.Onderwerp}: ${config['Regel / Logica']} (${config['Actie / Details']})\n`;
        } else if (config.Type === 'Contact Informatie' && isEscalationAllowed) {
            contactInfo += `- ${config.Onderwerp}: ${config['Regel / Logica']} (${config['Actie / Details']})\n`;
        } else if (config.Type === 'RAG Classificatie') {
            // Controleer op trefwoorden
            let keywordsText = config['Regel / Logica'].toLowerCase().replace('trefwoorden:', '').trim();
            let keywords = keywordsText.split(/[\s,]+/).filter(k => k.length > 2);
            let hasMatch = keywords.some(kw => qLower.includes(kw));
            if (hasMatch) {
                if (isEscalationAllowed) {
                    categorySpecificInstruction += `\nBeleidsregel voor dit onderwerp (${config.Onderwerp}): ${config['Actie / Details']}`;
                } else {
                    categorySpecificInstruction += `\nBeleidsregel voor dit onderwerp (${config.Onderwerp}): Vertel dat je hier niet direct mee kunt helpen, maar noem voorbeelden van wat je WEL kunt (recenteren, schoonmaken, etc). Geef GEEN contactgegevens.`;
                }
            }
        }
    }

    // Instructie over video-bestanden (mp4)
    let videoInstruction = `\nLet op: Als je uit de kennisbron een antwoord haalt dat een .mp4 bestand is (bijvoorbeeld 're-centeren meta (dec2025).mp4'), vermeld dan EXACT die bestandsnaam in je tekst, zodat het systeem de video kan tonen.`;

    // Bouw de samengestelde specifieke instructie
    let combinedInstructions = `
[SYSTEEM INSTRUCTIES UIT CONFIGURATIE]
${systemInstructions}

${isEscalationAllowed ? `[CONTACT INFORMATIE]\n${contactInfo}` : "[GEEN CONTACTGEGEVENS] Geef onder geen beding e-mailadressen of telefoonnummers in dit stadium."}

[SPECIFIEKE REGELS VOOR DEZE VRAAG]
${categorySpecificInstruction || "Geen specifieke RAG-regel getriggerd."}
${videoInstruction}
    `.trim();

    const knowledgeSource = faqData.map(item => `Vraag: ${item.Vraag}\nAntwoord: ${item.Antwoord}`).join('\n\n');
    const bigDataKnowledge = bigDataFAQ.map(item => `Vraag: ${item.Vraag}\nAntwoord: ${item.Antwoord} ${item.Bestand ? `[Bestand: ${item.Bestand}]` : ""}`).join('\n\n');
    const gamesKnowledge = gamesData.map(item => `Spel: ${item.Spel}\nDoelen: ${item.Therapiedoelen}\nSpeldoel: ${item.Speldoel}\nHoe spelen: ${item['Hoe te spelen']}\nSpeelveld: ${item.Speelveld}`).join('\n\n');

    const fullKnowledge = `
[FAQ DATA]
${knowledgeSource}

[EXTRA DATA]
${bigDataKnowledge}

[SPEL INFORMATIE]
${gamesKnowledge}
    `.trim();

    // Gebruik de externe template en vervang placeholders
    let finalPrompt = systemPromptTemplate
        .replace("{{CATEGORY_INSTRUCTION}}", combinedInstructions)
        .replace("{{KNOWLEDGE_SOURCE}}", fullKnowledge);

    return finalPrompt;
}

function appendMessage(role, text, imagePath = null, videoPath = null, filePath = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    const hollyAvatarPath = "Holly.jpg";
    
    // Maak links klikbaar (detecteert ook .pdf, .docx etc als ze als URL verschijnen)
    let formattedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
    // Vervang regeleindes
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    let mediaHtml = "";
    if (imagePath) {
        mediaHtml += `
            <div class="message-image">
                <img src="${imagePath}" alt="Informatie afbeelding" class="chat-img" onclick="window.open('${imagePath}', '_blank')">
            </div>
        `;
    }
    if (videoPath) {
        mediaHtml += `
            <div class="message-video">
                <video controls class="chat-video" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">
                    <source src="${videoPath}" type="video/mp4">
                    Je browser ondersteunt geen HTML5 video.
                </video>
            </div>
        `;
    }
    if (filePath) {
        const isPdf = filePath.toLowerCase().endsWith('.pdf');
        const icon = isPdf ? '📄' : '📎';
        mediaHtml += `
            <div class="message-file">
                <a href="${filePath}" target="_blank" class="file-link">
                    <span class="file-icon">${icon}</span>
                    <span class="file-name">${filePath}</span>
                </a>
            </div>
        `;
    }

    if (role === 'bot') {
        messageDiv.innerHTML = `
            <div class="bot-msg-wrapper">
                <div class="mini-avatar bot-avatar-replied">
                    <img src="${hollyAvatarPath}" alt="Holly">
                </div>
                <div class="content">
                    <p>${formattedText}</p>
                    ${mediaHtml}
                </div>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="content">
                <p>${formattedText}</p>
            </div>
        `;
    }
    
    chatViewport.appendChild(messageDiv);
    chatViewport.scrollTop = chatViewport.scrollHeight;
}

function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing';
    const hollyAvatarPath = "Holly.jpg";
    typingDiv.innerHTML = `
        <div class="bot-msg-wrapper thinking-wrapper">
            <div class="mini-avatar thinking-avatar">
                <img src="${hollyAvatarPath}" alt="Holly aan het nadenken">
            </div>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatViewport.appendChild(typingDiv);
    chatViewport.scrollTop = chatViewport.scrollHeight;
}

function removeTyping() {
    const typingDiv = document.getElementById('typing');
    if (typingDiv) typingDiv.remove();
}

function sendFollowUp() {
    userQuestionCount++;
    // Alleen na de eerste 2 vragen de follow-up sturen
    if (userQuestionCount <= 2) {
        setTimeout(() => {
            const messages = FOLLOW_UP_MESSAGES[detectedLanguage] || FOLLOW_UP_MESSAGES['nl'];
            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
            appendMessage('bot', randomMsg);
        }, 1500);
    }
}

async function getChatbotResponse(userText, retryCount = 0) {
    if (retryCount === 0) showTyping();
    
    // Bepaal thema voor de log
    if (retryCount === 0) {
        const thema = determineTheme(userText);
        themeHistory.push(thema);
        logQuestion(userText, thema);
    }

    const isAreaQuery = userText.toLowerCase().includes("oppervlakte") || 
                        userText.toLowerCase().includes("ruimte") || 
                        userText.toLowerCase().includes("afmeting");
    const areaImagePath = "Screenshot 2026-04-22 124526.jpg";

    // STAP 1: Lokale match in CSV (Sla over als de vraag al eerder gesteld is om AI-nuance te geven)
    const isRepeatedQuery = chatHistory.some(h => h.role === 'user' && h.text.toLowerCase().trim() === userText.toLowerCase().trim());
    const localMatch = isRepeatedQuery ? null : findLocalMatch(userText);
    
    if (localMatch) {
        let videoFile = localMatch.bestand && localMatch.bestand.toLowerCase().endsWith('.mp4') ? localMatch.bestand : null;
        let otherFile = localMatch.bestand && !videoFile ? localMatch.bestand : null;
        let responseText = localMatch.antwoord;

        // Voeg een introductie toe voor de lokale match (Level 1)
        if (videoFile || otherFile || responseText.includes('http')) {
            responseText = `U vroeg naar "${userText}".\n\nHier is de informatie:\n${localMatch.antwoord}`;
        }

        // Check of er direct een mp4 in de string zit (fallback)
        if (!videoFile) {
            const mp4Match = localMatch.antwoord.match(/([a-zA-Z0-9_\-\(\) ]+\.mp4)/i);
            if (mp4Match) {
                videoFile = mp4Match[0];
                if (localMatch.antwoord.trim() === videoFile) {
                    responseText = "Hier is de instructievideo:";
                }
            }
        }
        
        setTimeout(() => {
            removeTyping();
            appendMessage('bot', responseText, isAreaQuery ? areaImagePath : null, videoFile, otherFile);
            chatHistory.push({ role: 'user', text: userText });
            chatHistory.push({ role: 'bot', text: responseText });
            sendFollowUp();
        }, 600);
        return;
    }

    // STAP 2: AI Fallback met dynamische prompt
    const dynamicPrompt = getDynamicSystemPrompt(userText);
    
    // Bouw OpenAI Berichten Array
    const messages = [
        { role: "system", content: dynamicPrompt },
        ...chatHistory.map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.text
        })),
        { role: "user", content: userText }
    ];

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OpenAI API Fout:", errorData);
            throw new Error(errorData.error?.message || `Server error: ${response.status}`);
        }

        const data = await response.json();
        const botResponse = data.choices[0].message.content;
        
        removeTyping();
        const isResponseAboutArea = botResponse.toLowerCase().includes("oppervlakte") || isAreaQuery;
        
        let videoFile = null;
        let otherFile = null;
        
        const mp4Match = botResponse.match(/([a-zA-Z0-9_\-\(\) ]+\.mp4)/i);
        if (mp4Match) {
            videoFile = mp4Match[0];
        } else {
            // Check voor andere bestanden (.pdf, .pptx, etc)
            const fileMatch = botResponse.match(/([a-zA-Z0-9_\-\(\) ]+\.(pdf|pptx|docx|jpg|png))/i);
            if (fileMatch) {
                otherFile = fileMatch[0];
            }
        }
        
        appendMessage('bot', botResponse, isResponseAboutArea ? areaImagePath : null, videoFile, otherFile);
        
        chatHistory.push({ role: 'user', text: userText });
        chatHistory.push({ role: 'bot', text: botResponse });
        
        sendFollowUp();
        
    } catch (error) {
        removeTyping();
        appendMessage('bot', `Excuses, ik heb momenteel een technische storing. Probeer het later nog eens. (Fout: ${error.message})`);
    }
}

// UI & Initialisatie
loadFAQData();

const chatWindow = document.getElementById('chat-window');
const chatLauncher = document.getElementById('chat-launcher');
const chatBubble = document.getElementById('launcher-bubble');
const closeBtn = document.getElementById('close-chat');
const suggestionContainer = document.getElementById('suggestion-container');

function renderSuggestions() {
    suggestionContainer.innerHTML = '';
    SUGGESTIONS.forEach(text => {
        const chip = document.createElement('button');
        chip.className = 'suggestion-chip';
        chip.textContent = text;
        chip.addEventListener('click', () => {
            if (chatHistory.length === 0) {
                detectedLanguage = detectLanguage(text);
            }
            appendMessage('user', text);
            suggestionContainer.classList.add('hidden');
            getChatbotResponse(text);
        });
        suggestionContainer.appendChild(chip);
    });
    suggestionContainer.classList.remove('hidden');
}

const bubbleText = "Chat met Holly! 👋";

function typeWriter(text, i, fnCallback) {
    if (i < text.length) {
        chatBubble.innerHTML = text.substring(0, i + 1) + '<span aria-hidden="true" class="cursor"></span>';
        
        // Menselijke vertraging: random tussen 100 en 250ms voor een rustiger tempo
        let delay = Math.random() * (250 - 100) + 100;
        
        // Extra pauze bij leestekens voor een natuurlijke flow
        const char = text.charAt(i);
        if (char === '!' || char === '.' || char === '?' || char === ',') {
            delay += 500;
        }

        setTimeout(() => typeWriter(text, i + 1, fnCallback), delay);
    } else if (typeof fnCallback == 'function') {
        // Zorg dat de cursor blijft staan terwijl de bubble zichtbaar is
        chatBubble.innerHTML = text + '<span aria-hidden="true" class="cursor"></span>';
        setTimeout(fnCallback, 4000); // Iets langer zichtbaar blijven
    }
}

function showBubblePrompt() {
    if (!chatWindow.classList.contains('hidden')) return;
    chatBubble.classList.remove('hidden');
    typeWriter(bubbleText, 0, () => {
        chatBubble.classList.add('hidden');
        chatBubble.innerHTML = "";
    });
}

setTimeout(showBubblePrompt, 2000);

chatLauncher.addEventListener('click', () => {
    chatWindow.classList.remove('hidden');
    chatLauncher.style.transform = 'scale(0) rotate(-90deg)';
    chatLauncher.style.opacity = '0';
    chatLauncher.style.pointerEvents = 'none';
    chatBubble.classList.add('hidden');
    
    // Toon suggesties als er nog geen chatgeschiedenis is
    if (chatHistory.length === 0) {
        renderSuggestions();
    }
});

closeBtn.addEventListener('click', () => {
    chatWindow.classList.add('hidden');
    chatLauncher.style.transform = 'scale(1) rotate(0deg)';
    chatLauncher.style.opacity = '1';
    chatLauncher.style.pointerEvents = 'auto';
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;
    if (chatHistory.length === 0) {
        detectedLanguage = detectLanguage(text);
    }
    appendMessage('user', text);
    userInput.value = '';
    suggestionContainer.classList.add('hidden');
    getChatbotResponse(text);
});
