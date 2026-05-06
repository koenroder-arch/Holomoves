// API configuratie is nu beveiligd via de server (server.js + .env)
const CHAT_PROXY_URL = "/api/chat";

const chatViewport = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');

// 1. Chatbot Config & State
let faqData = [];
let configData = [];
let chatHistory = [];
let userQuestionCount = 0; // Telt het aantal gestelde vragen
let systemPromptTemplate = ""; // Wordt geladen uit bestand
const CSV_FILE_PATH = "Vragen en antwoorden ChatBot CSV.csv";
const CONFIG_FILE_PATH = "Chatbot_Configuratie_HoloMoves.csv";
const PROMPT_FILE_PATH = "system_prompt.txt";
const SUGGESTIONS = [
    "Hoe maak ik de Quest schoon?",
    "Hoe werkt het casten?",
    "Waarom doet het recenteren het niet?",
    "Hoeveel ruimte heb ik nodig?"
];

const FOLLOW_UP_MESSAGES = [
    "Heeft u verder nog vragen?",
    "Kan ik u ergens anders mee helpen?",
    "Is er nog iets waarbij ik u van dienst kan zijn?",
    "Hebt u nog andere vragen over HoloMoves?",
    "Wilt u nog iets anders weten?",
    "Kan ik u nog ergens bij ondersteunen?",
    "Zijn er nog onduidelijkheden waar ik bij kan helpen?"
];

// 2. Functie om CSV te laden en te parsen
async function loadFAQData() {
    try {
        // Laad FAQ CSV
        const csvResponse = await fetch(CSV_FILE_PATH);
        const csvText = await csvResponse.text();
        
        // Laad Configuratie CSV
        const configResponse = await fetch(CONFIG_FILE_PATH);
        const configText = await configResponse.text();

        // Laad Systeem Prompt
        const promptResponse = await fetch(PROMPT_FILE_PATH);
        systemPromptTemplate = await promptResponse.text();
        
        // FAQ Parser
        const lines = csvText.split('\n').filter(line => line.trim() !== '');
        const headers = lines[0].split(';').map(h => h.trim());
        
        faqData = lines.slice(1).map(line => {
            const values = line.split(';').map(v => v.trim());
            const entry = {};
            headers.forEach((header, i) => {
                if (values[i]) entry[header] = values[i];
            });
            return entry;
        }).filter(entry => entry.Vraag && entry.Antwoord);
        
        // Config Parser
        const configLines = configText.split('\n').filter(line => line.trim() !== '');
        const configHeaders = configLines[0].split(';').map(h => h.trim());
        
        configData = configLines.slice(1).map(line => {
            const values = line.split(';').map(v => v.trim());
            const entry = {};
            configHeaders.forEach((header, i) => {
                if (values[i]) entry[header] = values[i];
            });
            return entry;
        }).filter(entry => entry.Type && entry.Onderwerp);

        console.log("Data geladen:", faqData.length, "FAQ items,", configData.length, "Config items en systeem prompt.");
    } catch (error) {
        console.error("Fout bij laden data:", error);
    }
}

// 3. Functie voor lokale matching (Level 1 van de RAG-workflow)
function findLocalMatch(userQuery) {
    const query = userQuery.toLowerCase().trim();
    
    // We zoeken naar een match die minstens 80% van de woorden bevat
    const queryWords = query.split(/\s+/).filter(w => w.length > 3);
    
    for (const item of faqData) {
        const question = item.Vraag.toLowerCase();
        
        // 1. Exacte match of bevat de hele vraag
        if (question.includes(query) || query.includes(question)) {
            return item.Antwoord;
        }
        
        // 2. Keyword overlap
        if (queryWords.length > 0) {
            const matchCount = queryWords.filter(word => question.includes(word)).length;
            const matchRatio = matchCount / queryWords.length;
            
            if (matchRatio >= 0.8) { 
                return item.Antwoord;
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
    const isEscalationAllowed = chatHistory.length >= 4; // Toegestaan vanaf de 3e vraag van de gebruiker
    
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

    // Gebruik de externe template en vervang placeholders
    let finalPrompt = systemPromptTemplate
        .replace("{{CATEGORY_INSTRUCTION}}", combinedInstructions)
        .replace("{{KNOWLEDGE_SOURCE}}", knowledgeSource);

    return finalPrompt;
}

function appendMessage(role, text, imagePath = null, videoPath = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    const hollyAvatarPath = "holly_avatar.png";
    
    // Maak links klikbaar
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
    const hollyAvatarPath = "holly_avatar.png";
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
            const randomMsg = FOLLOW_UP_MESSAGES[Math.floor(Math.random() * FOLLOW_UP_MESSAGES.length)];
            appendMessage('bot', randomMsg);
        }, 1500);
    }
}

async function getChatbotResponse(userText, retryCount = 0) {
    if (retryCount === 0) showTyping();
    
    // Bepaal thema voor de log
    if (retryCount === 0) {
        const thema = determineTheme(userText);
        logQuestion(userText, thema);
    }

    const isAreaQuery = userText.toLowerCase().includes("oppervlakte") || 
                        userText.toLowerCase().includes("ruimte") || 
                        userText.toLowerCase().includes("afmeting");
    const areaImagePath = "Screenshot 2026-04-22 124526.jpg";

    // STAP 1: Lokale match in CSV
    const localMatch = findLocalMatch(userText);
    if (localMatch) {
        let videoFile = null;
        let responseText = localMatch;
        // Check of er direct een mp4 in de string zit
        const mp4Match = localMatch.match(/([a-zA-Z0-9_\-\(\) ]+\.mp4)/i);
        if (mp4Match) {
            videoFile = mp4Match[0];
            if (localMatch.trim() === videoFile) {
                responseText = "Hier is de instructievideo:";
            }
        }
        
        setTimeout(() => {
            removeTyping();
            appendMessage('bot', responseText, isAreaQuery ? areaImagePath : null, videoFile);
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
        const mp4Match = botResponse.match(/([a-zA-Z0-9_\-\(\) ]+\.mp4)/i);
        if (mp4Match) {
            videoFile = mp4Match[0];
        }
        
        appendMessage('bot', botResponse, isResponseAboutArea ? areaImagePath : null, videoFile);
        
        chatHistory.push({ role: 'user', text: userText });
        chatHistory.push({ role: 'bot', text: botResponse });
        
        sendFollowUp();
        
    } catch (error) {
        removeTyping();
        appendMessage('bot', `Excuses, Holly heeft momenteel een technische storing. Probeer het later nog eens. (Fout: ${error.message})`);
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
    appendMessage('user', text);
    userInput.value = '';
    suggestionContainer.classList.add('hidden');
    getChatbotResponse(text);
});
