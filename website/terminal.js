// Import commands
import helpCmd from './scripts/commands/help.js';
import aboutCmd from './scripts/commands/about.js';
import clearCmd from './scripts/commands/clear.js';
import echoCmd from './scripts/commands/echo.js';
import dateCmd from './scripts/commands/date.js';
import whoamiCmd from './scripts/commands/whoami.js';
import historyCmd from './scripts/commands/history.js';
import colorCmd from './scripts/commands/color.js';
import bannerCmd from './scripts/commands/banner.js';
import githubCmd from './scripts/commands/github.js';
import contactCmd from './scripts/commands/contact.js';
import privacyCmd from './scripts/commands/privacy.js';
import blueskyCmd from './scripts/commands/bluesky.js';

// Version
const VERSION = '1.0.0';

// Create inline input element
const inlineInput = document.createElement('input');
inlineInput.type = 'text';
inlineInput.className = 'terminal-inline-input';
inlineInput.autocomplete = 'off';
inlineInput.autocorrect = 'on';
inlineInput.autocapitalize = 'off';
inlineInput.spellcheck = false;

const mentionSuggestions = document.createElement('div');
mentionSuggestions.className = 'mention-suggestions';
mentionSuggestions.style.display = 'none';

const TERMINAL_SOUND_FILES = window.location.hostname.endsWith('neocities.org') ? {
    startup: 'https://lit.ruv.wtf/sounds/poweron.mp3',
    commandLaunch: 'https://lit.ruv.wtf/sounds/floppyreadshort.wav',
    typing: [
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_01.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_02.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_03.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_04.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_05.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charsingle_06.wav'
    ],
    enter: [
        'https://lit.ruv.wtf/sounds/ui_hacking_charenter_01.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charenter_02.wav',
        'https://lit.ruv.wtf/sounds/ui_hacking_charenter_03.wav'
    ],
    scroll: 'https://lit.ruv.wtf/sounds/ui_hacking_charscroll.wav'
} : {
    startup: 'sounds/poweron.mp3',
    commandLaunch: 'sounds/floppyreadshort.wav',
    typing: [
        'sounds/ui_hacking_charsingle_01.wav',
        'sounds/ui_hacking_charsingle_02.wav',
        'sounds/ui_hacking_charsingle_03.wav',
        'sounds/ui_hacking_charsingle_04.wav',
        'sounds/ui_hacking_charsingle_05.wav',
        'sounds/ui_hacking_charsingle_06.wav'
    ],
    enter: [
        'sounds/ui_hacking_charenter_01.wav',
        'sounds/ui_hacking_charenter_02.wav',
        'sounds/ui_hacking_charenter_03.wav'
    ],
    scroll: 'sounds/ui_hacking_charscroll.wav'
};

const terminalSoundState = {
    startupPlayed: false,
    startupUnlockBound: false,
    disabled: false
};

/**
 * Select a random item from an array.
 * @param {string[]} values - Candidate values
 * @returns {string} Randomly selected value
 */
function pickRandomValue(values) {
    return values[Math.floor(Math.random() * values.length)];
}

/**
 * Play a single sound file at the provided volume.
 * @param {string} filePath - Relative sound file path
 * @param {number} volume - Playback volume between 0 and 1
 * @returns {Promise<boolean>} True when playback starts
 */
async function playSoundFile(filePath, volume) {
    if (terminalSoundState.disabled) {
        return false;
    }

    try {
        const sound = new Audio(filePath);
        sound.preload = 'auto';
        sound.volume = volume;
        await sound.play();
        return true;
    } catch (error) {
        if (!error || error.name !== 'NotAllowedError') {
            terminalSoundState.disabled = true;
        }
        return false;
    }
}

/**
 * Attempt startup sound playback and defer until user interaction if blocked.
 * @returns {Promise<void>}
 */
async function attemptStartupSoundPlayback() {
    if (terminalSoundState.startupPlayed) {
        return;
    }

    const didPlay = await playSoundFile(TERMINAL_SOUND_FILES.startup, 0.5);
    if (didPlay) {
        terminalSoundState.startupPlayed = true;
        terminalSoundState.startupUnlockBound = false;
        return;
    }

    if (terminalSoundState.startupUnlockBound) {
        return;
    }

    terminalSoundState.startupUnlockBound = true;
    const unlockAndPlay = async () => {
        if (terminalSoundState.startupPlayed) {
            return;
        }

        const unlocked = await playSoundFile(TERMINAL_SOUND_FILES.startup, 0.5);
        if (unlocked) {
            terminalSoundState.startupPlayed = true;
        }
    };

    document.addEventListener('pointerdown', unlockAndPlay, { once: true });
    document.addEventListener('keydown', unlockAndPlay, { once: true });
}

/**
 * Play keypress sound effects for terminal typing/navigation.
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {void}
 */
function playTerminalKeySound(event) {
    const key = event.key;
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown') {
        void playSoundFile(TERMINAL_SOUND_FILES.scroll, 0.22);
        return;
    }

    if (key === 'Enter') {
        void playSoundFile(pickRandomValue(TERMINAL_SOUND_FILES.enter), 0.26);
        return;
    }

    const isTypingKey = key.length === 1 || key === 'Backspace' || key === 'Delete';
    if (isTypingKey) {
        void playSoundFile(pickRandomValue(TERMINAL_SOUND_FILES.typing), 0.2);
    }
}

// Initialize xterm.js terminal
const term = new Terminal({
    cursorBlink: false,
    cursorStyle: 'underline',
    cursorInactiveStyle: 'none',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: 14,
    theme: {
        background: '#001800',
        foreground: '#00ff00',
        cursor: 'transparent',
        cursorAccent: 'transparent',
        selection: 'rgba(0, 255, 0, 0.3)',
        black: '#000000',
        red: '#ff0000',
        green: '#00ff00',
        yellow: '#ffff00',
        blue: '#0066ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#666666',
        brightRed: '#ff6666',
        brightGreen: '#66ff66',
        brightYellow: '#ffff66',
        brightBlue: '#6666ff',
        brightMagenta: '#ff66ff',
        brightCyan: '#66ffff',
        brightWhite: '#ffffff'
    },
    allowTransparency: true,
    scrollback: 1000,
    disableStdin: true
});

// Add addons
const fitAddon = new FitAddon.FitAddon();
const webLinksAddon = new WebLinksAddon.WebLinksAddon();

term.loadAddon(fitAddon);
term.loadAddon(webLinksAddon);

// Open terminal
term.open(document.getElementById('terminal'));
fitAddon.fit();

// Register custom link provider for clickable commands
term.registerLinkProvider({
    provideLinks: (bufferLineNumber, callback) => {
        const line = term.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) {
            callback(undefined);
            return;
        }
        
        const lineText = line.translateToString();
        const links = [];
        
        // Find all command names that match our known commands
        const commandNames = ['help', 'about', 'clear', 'echo', 'date', 'whoami', 'history', 'color', 'banner', 'bluesky', 'chat', 'github', 'contact', 'privacy'];
        
        commandNames.forEach(cmd => {
            let startIndex = 0;
            while (true) {
                const index = lineText.indexOf(cmd, startIndex);
                if (index === -1) break;
                
                // Check if it's a standalone command word (surrounded by spaces, brackets, or at start/end)
                const charBefore = index > 0 ? lineText[index - 1] : ' ';
                const charAfter = index + cmd.length < lineText.length ? lineText[index + cmd.length] : ' ';
                
                const validBefore = /[\s\[\]]/.test(charBefore);
                const validAfter = /[\s\[\]\-]/.test(charAfter);
                
                if (validBefore && validAfter) {
                    links.push({
                        range: {
                            start: { x: index + 1, y: bufferLineNumber },
                            end: { x: index + cmd.length + 1, y: bufferLineNumber }
                        },
                        text: cmd,
                        activate: () => {
                            runQuickCommand(cmd);
                        }
                    });
                }
                
                startIndex = index + 1;
            }
        });
        
        callback(links.length > 0 ? links : undefined);
    }
});

// Adjust font size based on screen width
function adjustFontSize() {
    const width = window.innerWidth;
    if (width < 350) {
        term.options.fontSize = 8;
    } else if (width < 480) {
        term.options.fontSize = 10;
    } else if (width < 768) {
        term.options.fontSize = 12;
    } else {
        term.options.fontSize = 14;
    }
    fitAddon.fit();
}

adjustFontSize();

// Check viewport size for border display
function checkViewportSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (width < 1280 || height < 720) {
        document.body.classList.add('small-viewport');
    } else {
        document.body.classList.remove('small-viewport');
    }
}

checkViewportSize();

// Make terminal responsive
window.addEventListener('resize', () => {
    adjustFontSize();
    checkViewportSize();
});

// Mobile keyboard detection using Visual Viewport API
let initialViewportHeight = window.innerHeight;

/**
 * Detect if mobile keyboard is open based on viewport height reduction
 */
function checkKeyboardState() {
    if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const heightReduction = initialViewportHeight - viewportHeight;
        // If viewport shrank by more than 150px, keyboard is likely open
        if (heightReduction > 150) {
            document.body.classList.add('keyboard-open');
        } else {
            document.body.classList.remove('keyboard-open');
        }
    }
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        checkKeyboardState();
        checkViewportSize();
        adjustFontSize();
        setTimeout(positionInlineInput, 50);
    });
}

// Update initial height on orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        initialViewportHeight = window.innerHeight;
        checkViewportSize();
    }, 300);
});

// Update system time
function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('systemTime').textContent = timeStr;
}
updateTime();
setInterval(updateTime, 1000);

// Command history
let commandHistory = [];
let historyIndex = -1;
let currentLine = '';
let cursorPosition = 0;

// Chat mode state
let chatMode = {
    active: false,
    messages: [],
    lastSync: null,
    pollInterval: null,
    inputLine: '',
    displayNames: {}, // Cache for display names
    mentionDirectory: [],
    mentionLoadedAt: 0,
    mentionAutocomplete: {
        tokenStart: -1,
        tokenEnd: -1,
        matches: [],
        index: 0
    }
};

const MATRIX_PUBLIC_READ_TOKEN = 'syt_Z2VuZXJhbGNoYXQtcmVhZG9ubHk_sikLltUtfbHlztnanEVm_2icJ1o';
const IS_NEOCITIES_HOST = window.location.hostname.endsWith('neocities.org');
const MATRIX_BRIDGE_URL = 'https://lit.ruv.wtf/matrix-bridge.html';

/**
 * Matrix Bridge - Iframe-based communication for CSP-restricted hosts
 */
const matrixBridge = {
    iframe: null,
    ready: false,
    pendingRequests: new Map(),
    requestCounter: 0
};

/**
 * Initialize the Matrix iframe bridge
 * @returns {Promise<boolean>} True if bridge loaded successfully
 */
async function initMatrixBridge() {
    if (matrixBridge.iframe) {
        return matrixBridge.ready;
    }

    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.src = MATRIX_BRIDGE_URL;
        iframe.style.display = 'none';
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        
        const timeout = setTimeout(() => {
            console.error('[Matrix Bridge] Failed to load iframe bridge');
            matrixBridge.ready = false;
            resolve(false);
        }, 10000);

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'matrix:bridge:ready') {
                clearTimeout(timeout);
                matrixBridge.ready = true;
                console.log('[Matrix Bridge] Iframe bridge ready');
                resolve(true);
            }
        });

        document.body.appendChild(iframe);
        matrixBridge.iframe = iframe;
    });
}

/**
 * Send a request to the Matrix bridge via postMessage
 * @param {string} type - Request type (e.g. 'matrix:auth', 'matrix:sendMessage')
 * @param {object} payload - Request payload
 * @returns {Promise<any>} Response from bridge
 */
function matrixBridgeRequest(type, payload) {
    return new Promise((resolve, reject) => {
        if (!matrixBridge.iframe || !matrixBridge.ready) {
            reject(new Error('Matrix bridge not initialized'));
            return;
        }

        const requestId = `req_${++matrixBridge.requestCounter}`;
        const timeout = setTimeout(() => {
            matrixBridge.pendingRequests.delete(requestId);
            reject(new Error('Matrix bridge request timeout'));
        }, 30000);

        matrixBridge.pendingRequests.set(requestId, { resolve, reject, timeout });

        matrixBridge.iframe.contentWindow.postMessage({
            type,
            requestId,
            payload
        }, MATRIX_BRIDGE_URL);
    });
}

/**
 * Handle responses from the Matrix bridge
 */
window.addEventListener('message', (event) => {
    if (event.origin !== new URL(MATRIX_BRIDGE_URL).origin) {
        return;
    }

    const { type, requestId, payload } = event.data;
    
    if (!type || !requestId || !type.includes(':response')) {
        return;
    }

    const pending = matrixBridge.pendingRequests.get(requestId);
    if (pending) {
        clearTimeout(pending.timeout);
        matrixBridge.pendingRequests.delete(requestId);
        pending.resolve(payload);
    }
});

// Matrix API helper
const matrixApi = async (endpoint, method = 'GET', body = null) => {
    if (!window.matrixSession) return null;
    
    // Use iframe bridge on Neocities
    if (IS_NEOCITIES_HOST) {
        if (!matrixBridge.ready) {
            const initialized = await initMatrixBridge();
            if (!initialized) {
                return {
                    errcode: 'M_BRIDGE_UNAVAILABLE',
                    error: 'Matrix bridge failed to initialize'
                };
            }
        }

        try {
            const result = await matrixBridgeRequest('matrix:api', {
                endpoint,
                method,
                body,
                accessToken: window.matrixSession.accessToken
            });
            return result;
        } catch (error) {
            return {
                errcode: 'M_BRIDGE_ERROR',
                error: error.message
            };
        }
    }

    // Direct API call for non-CSP-restricted hosts
    const homeserver = 'https://chat.ruv.wtf';
    const url = `${homeserver}/_matrix/client/r0${endpoint}`;
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (window.matrixSession.accessToken) {
        headers['Authorization'] = `Bearer ${window.matrixSession.accessToken}`;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(url, options);
    return response.json();
};

/**
 * Fetch the latest public chat message using the read-only public token.
 * @param {string} homeserver - Matrix homeserver URL
 * @param {string} roomAlias - Room alias (e.g. #generalchat:example.org)
 * @returns {Promise<{time: string, sender: string, text: string, timestamp: number} | null>} Last message summary or null
 */
async function fetchPublicLastMessage(homeserver, roomAlias) {
    // Use iframe bridge on Neocities
    if (IS_NEOCITIES_HOST) {
        if (!matrixBridge.ready) {
            await initMatrixBridge();
        }
        
        if (!matrixBridge.ready) {
            return null;
        }

        try {
            // Resolve room alias first
            let roomId = null;
            try {
                const resolveResult = await matrixBridgeRequest('matrix:resolveAlias', { roomAlias });
                if (resolveResult && !resolveResult.error && resolveResult.room_id) {
                    roomId = resolveResult.room_id;
                }
            } catch (error) {
                // Continue with fallback
            }

            if (!roomId) {
                roomId = '!RkOwQGTlDJwZbNxGeS:b.ruv.wtf';
            }

            // Fetch last message
            const result = await matrixBridgeRequest('matrix:fetchLastMessage', { roomId });
            if (!result || result.error || !Array.isArray(result.chunk)) {
                return null;
            }

            const lastTextEvent = result.chunk.find((event) => {
                return event && event.type === 'm.room.message' && event.content && event.content.msgtype === 'm.text';
            });

            if (!lastTextEvent) {
                return null;
            }

            const timestamp = typeof lastTextEvent.origin_server_ts === 'number'
                ? new Date(lastTextEvent.origin_server_ts)
                : new Date();
            const time = timestamp.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const sender = typeof lastTextEvent.sender === 'string'
                ? lastTextEvent.sender.split(':')[0].replace(/^@/, '')
                : 'unknown';
            const text = lastTextEvent.content.body || '';
            const timestampMs = typeof lastTextEvent.origin_server_ts === 'number'
                ? lastTextEvent.origin_server_ts
                : Date.now();

            return { time, sender, text, timestamp: timestampMs };
        } catch (error) {
            return null;
        }
    }

    // Direct API call for non-CSP-restricted hosts
    const resolvedAlias = encodeURIComponent(roomAlias);
    const authHeaders = {
        Authorization: `Bearer ${MATRIX_PUBLIC_READ_TOKEN}`
    };

    let roomId = null;
    try {
        const roomResponse = await fetch(`${homeserver}/_matrix/client/r0/directory/room/${resolvedAlias}`, {
            headers: authHeaders
        });
        if (roomResponse.ok) {
            const roomData = await roomResponse.json();
            roomId = roomData && roomData.room_id ? roomData.room_id : null;
        }
    } catch (error) {
        roomId = null;
    }

    if (!roomId) {
        roomId = '!RkOwQGTlDJwZbNxGeS:b.ruv.wtf';
    }

    const resolvedRoomId = encodeURIComponent(roomId);
    const messagesResponse = await fetch(`${homeserver}/_matrix/client/r0/rooms/${resolvedRoomId}/messages?dir=b&limit=30`, {
        headers: authHeaders
    });
    if (!messagesResponse.ok) {
        return null;
    }

    const messagesData = await messagesResponse.json();
    if (!messagesData || !Array.isArray(messagesData.chunk)) {
        return null;
    }

    const lastTextEvent = messagesData.chunk.find((event) => {
        return event && event.type === 'm.room.message' && event.content && event.content.msgtype === 'm.text';
    });

    if (!lastTextEvent) {
        return null;
    }

    const timestamp = typeof lastTextEvent.origin_server_ts === 'number'
        ? new Date(lastTextEvent.origin_server_ts)
        : new Date();
    const time = timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const sender = typeof lastTextEvent.sender === 'string'
        ? lastTextEvent.sender.split(':')[0].replace(/^@/, '')
        : 'unknown';
    const text = lastTextEvent.content.body || '';
    const timestampMs = typeof lastTextEvent.origin_server_ts === 'number'
        ? lastTextEvent.origin_server_ts
        : Date.now();

    return { time, sender, text, timestamp: timestampMs };
}

/**
 * Fetch Matrix presence for a user using the read-only public token.
 * @param {string} homeserver - Matrix homeserver URL
 * @param {string} userId - Full Matrix user ID
 * @returns {Promise<string | null>} Presence state (online/offline/unavailable) or null when unavailable
 */
async function fetchPublicPresence(homeserver, userId) {
    // Use iframe bridge on Neocities
    if (IS_NEOCITIES_HOST) {
        if (!matrixBridge.ready) {
            await initMatrixBridge();
        }
        
        if (!matrixBridge.ready) {
            return null;
        }

        try {
            const result = await matrixBridgeRequest('matrix:fetchPresence', { userId });
            if (result && !result.error && typeof result.presence === 'string') {
                return result.presence;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    // Direct API call for non-CSP-restricted hosts
    const authHeaders = {
        Authorization: `Bearer ${MATRIX_PUBLIC_READ_TOKEN}`
    };
    const encodedUserId = encodeURIComponent(userId);
    const response = await fetch(`${homeserver}/_matrix/client/r0/presence/${encodedUserId}/status`, {
        headers: authHeaders
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    return data && typeof data.presence === 'string' ? data.presence : null;
}

/**
 * Format a unix-millisecond timestamp as relative age text.
 * @param {number} timestampMs - Epoch timestamp in milliseconds
 * @returns {string} Relative time label
 */
function formatTimeAgo(timestampMs) {
    if (typeof timestampMs !== 'number') {
        return 'unknown';
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
    if (elapsedSeconds < 60) {
        return 'just now';
    }

    if (elapsedSeconds < 3600) {
        return `${Math.floor(elapsedSeconds / 60)}m ago`;
    }

    if (elapsedSeconds < 86400) {
        return `${Math.floor(elapsedSeconds / 3600)}h ago`;
    }

    return `${Math.floor(elapsedSeconds / 86400)}d ago`;
}

/**
 * Write a startup MOTD line with the latest public chat message.
 * Uses a short timeout so startup stays responsive.
 * @returns {Promise<void>}
 */
async function writeStartupChatMotd() {
    try {
        const result = await Promise.race([
            (async () => {
                const [latest, litruvPresence] = await Promise.all([
                    fetchPublicLastMessage('https://chat.ruv.wtf', '#generalchat:b.ruv.wtf'),
                    fetchPublicPresence('https://chat.ruv.wtf', '@litruv:b.ruv.wtf')
                ]);
                return { latest, litruvPresence };
            })(),
            new Promise((resolve) => setTimeout(() => resolve({ latest: null, litruvPresence: null }), 2500))
        ]);

        if (!result.latest && !result.litruvPresence) {
            return;
        }

        const lastMessageAge = result.latest
            ? formatTimeAgo(result.latest.timestamp)
            : null;
        const onlineText = result.litruvPresence === 'online'
            ? 'online'
            : 'offline';

        if (lastMessageAge) {
            term.writeln(`  #generalchat · last message ${lastMessageAge} · @litruv:b.ruv.wtf ${onlineText}`);
            term.writeln(`  Run 'chat' to join in on the conversation`);
        } else {
            term.writeln(`  #generalchat · @litruv:b.ruv.wtf ${onlineText}`);
            term.writeln(`  Run 'chat' to join in on the conversation`);
        }
        term.writeln('');
    } catch (error) {
        // Ignore MOTD fetch issues to avoid blocking terminal startup.
    }
}

// Get display name for a user (with caching)
async function getDisplayName(userId) {
    // Check cache first
    if (chatMode.displayNames[userId]) {
        return chatMode.displayNames[userId];
    }
    
    try {
        const data = await matrixApi(`/profile/${encodeURIComponent(userId)}/displayname`, 'GET');
        const displayName = data.displayname || userId.split(':')[0].substring(1);
        chatMode.displayNames[userId] = displayName;
        return displayName;
    } catch (error) {
        // Fallback to username part
        const fallback = userId.split(':')[0].substring(1);
        chatMode.displayNames[userId] = fallback;
        return fallback;
    }
}

// Get color for user based on their ID (consistent hashing)
function getUserColor(username) {
    // Color palette that works well on dark green background
    const colors = [
        '\x1b[91m',  // bright red
        '\x1b[92m',  // bright green
        '\x1b[93m',  // bright yellow
        '\x1b[94m',  // bright blue
        '\x1b[95m',  // bright magenta
        '\x1b[96m',  // bright cyan
        '\x1b[33m',  // yellow
        '\x1b[35m',  // magenta
        '\x1b[36m',  // cyan
    ];
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
}

// Check if display name is already taken
async function isDisplayNameTaken(newName) {
    try {
        const members = await matrixApi(`/rooms/${window.matrixSession.roomId}/joined_members`, 'GET');
        if (members && members.joined) {
            for (const [userId, member] of Object.entries(members.joined)) {
                // Skip our own user
                if (userId === window.matrixSession.userId) continue;
                
                const displayName = member.display_name || userId.split(':')[0].substring(1);
                if (displayName.toLowerCase() === newName.toLowerCase()) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking display names:', error);
        return false; // Allow on error
    }
}

/**
 * Determine if a Matrix display name appears unchanged/default.
 * @param {string} displayName - Current display name
 * @returns {boolean} True when name looks like an auto-generated default
 */
function isDefaultDisplayName(displayName) {
    if (!displayName) {
        return true;
    }

    const trimmedName = displayName.trim();
    if (!trimmedName) {
        return true;
    }

    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Pattern.test(trimmedName);
}

/**
 * Check whether to show a nickname setup hint for the current user.
 * @returns {Promise<boolean>} True when the user should be prompted to change nickname
 */
async function shouldShowNicknameHint() {
    if (!window.matrixSession || !window.matrixSession.userId) {
        return false;
    }

    try {
        const encodedUserId = encodeURIComponent(window.matrixSession.userId);
        const profileData = await matrixApi(`/profile/${encodedUserId}/displayname`, 'GET');
        const displayName = profileData && typeof profileData.displayname === 'string'
            ? profileData.displayname
            : '';

        return isDefaultDisplayName(displayName);
    } catch (error) {
        return false;
    }
}

/**
 * Sync mention directory for autocomplete and mention rendering.
 * @param {boolean} force - When true, bypass cache time
 * @returns {Promise<void>}
 */
async function syncMentionDirectory(force = false) {
    if (!window.matrixSession || !window.matrixSession.roomId) {
        return;
    }

    const now = Date.now();
    if (!force && chatMode.mentionDirectory.length > 0 && (now - chatMode.mentionLoadedAt) < 30000) {
        return;
    }

    try {
        const members = await matrixApi(`/rooms/${window.matrixSession.roomId}/joined_members`, 'GET');
        if (!members || !members.joined) {
            return;
        }

        const directory = [];
        Object.entries(members.joined).forEach(([userId, member]) => {
            const fallbackName = userId.split(':')[0].substring(1);
            const displayName = member && member.display_name ? member.display_name : fallbackName;
            chatMode.displayNames[userId] = displayName;
            directory.push({ userId, displayName });
        });

        chatMode.mentionDirectory = directory;
        chatMode.mentionLoadedAt = now;
    } catch (error) {
        // Ignore mention directory refresh failures.
    }
}

/**
 * Get mention autocomplete matches for query.
 * @param {string} query - Partial display name text without @
 * @returns {Array<{userId: string, displayName: string}>} Sorted matches
 */
function getMentionMatches(query) {
    const queryLower = query.toLowerCase();
    const matches = chatMode.mentionDirectory.filter((entry) => {
        const display = entry.displayName.toLowerCase();
        const localPart = entry.userId.split(':')[0].substring(1).toLowerCase();
        return display.startsWith(queryLower) || localPart.startsWith(queryLower);
    });

    matches.sort((left, right) => left.displayName.localeCompare(right.displayName));
    return matches;
}

/**
 * Escape text for HTML output.
 * @param {string} value - Raw text
 * @returns {string} HTML-escaped text
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Extract current mention token context from the input cursor.
 * @returns {{atIndex: number, cursorPosition: number, tokenText: string} | null} Token info or null
 */
function getMentionTokenContext() {
    const cursorPosition = inlineInput.selectionStart;
    const fullValue = inlineInput.value;
    const textBeforeCursor = fullValue.slice(0, cursorPosition);
    const tokenStart = textBeforeCursor.search(/(?:^|\s)@[^\s]*$/);

    if (tokenStart === -1) {
        return null;
    }

    const atIndex = textBeforeCursor.indexOf('@', tokenStart);
    if (atIndex === -1) {
        return null;
    }

    const tokenText = textBeforeCursor.slice(atIndex + 1);
    if (!tokenText || tokenText.includes(':')) {
        return null;
    }

    return { atIndex, cursorPosition, tokenText };
}

/**
 * Render mention suggestions above the inline input.
 * @returns {void}
 */
function renderMentionSuggestions() {
    const { matches, index } = chatMode.mentionAutocomplete;
    if (!chatMode.active || matches.length === 0) {
        mentionSuggestions.style.display = 'none';
        return;
    }

    const limitedMatches = matches.slice(0, 5);
    mentionSuggestions.innerHTML = limitedMatches.map((entry, entryIndex) => {
        const selectedClass = index >= 0 && entryIndex === (index % limitedMatches.length) ? ' selected' : '';
        return `<span class="mention-suggestion${selectedClass}">@${escapeHtml(entry.displayName)}</span>`;
    }).join('');
    mentionSuggestions.style.display = 'block';
    positionInlineInput();
}

/**
 * Check whether mention suggestions are currently visible.
 * @returns {boolean} True when suggestion strip is active
 */
function hasVisibleMentionSuggestions() {
    return chatMode.active
        && mentionSuggestions.style.display !== 'none'
        && chatMode.mentionAutocomplete.matches.length > 0;
}

/**
 * Hide mention suggestion UI and clear state.
 * @returns {void}
 */
function resetMentionAutocomplete() {
    chatMode.mentionAutocomplete = {
        tokenStart: -1,
        tokenEnd: -1,
        matches: [],
        index: 0
    };
    mentionSuggestions.style.display = 'none';
    mentionSuggestions.innerHTML = '';
}

/**
 * Refresh mention suggestions based on current cursor token.
 * @returns {Promise<void>}
 */
async function refreshMentionSuggestionsFromInput() {
    if (!chatMode.active) {
        resetMentionAutocomplete();
        return;
    }

    const context = getMentionTokenContext();
    if (!context) {
        resetMentionAutocomplete();
        return;
    }

    await syncMentionDirectory();
    const matches = getMentionMatches(context.tokenText);
    if (matches.length === 0) {
        resetMentionAutocomplete();
        return;
    }

    chatMode.mentionAutocomplete = {
        tokenStart: context.atIndex,
        tokenEnd: context.cursorPosition,
        matches,
        index: -1
    };
    renderMentionSuggestions();
}

/**
 * Replace selected mention token in input with selected display name.
 * @param {{userId: string, displayName: string}} selectedEntry - Selected mention entry
 * @returns {void}
 */
function applyMentionReplacement(selectedEntry) {
    const rangeStart = chatMode.mentionAutocomplete.tokenStart;
    const rangeEnd = chatMode.mentionAutocomplete.tokenEnd;
    if (rangeStart < 0 || rangeEnd < 0) {
        return;
    }

    const fullValue = inlineInput.value;
    const valueBeforeMention = fullValue.slice(0, rangeStart);
    const valueAfterMention = fullValue.slice(rangeEnd);
    const mentionText = `@${selectedEntry.displayName}`;
    const hasTrailingSpace = valueAfterMention.startsWith(' ');
    const nextValue = `${valueBeforeMention}${mentionText}${hasTrailingSpace ? '' : ' '}${valueAfterMention}`;
    const nextCursor = valueBeforeMention.length + mentionText.length + (hasTrailingSpace ? 0 : 1);

    inlineInput.value = nextValue;
    inlineInput.setSelectionRange(nextCursor, nextCursor);
    chatMode.inputLine = nextValue;
    chatMode.mentionAutocomplete.tokenEnd = nextCursor;
}

/**
 * Commit the currently selected mention suggestion into input text.
 * @returns {boolean} True when a suggestion was applied
 */
function commitSelectedMentionSuggestion() {
    if (!hasVisibleMentionSuggestions()) {
        return false;
    }

    if (chatMode.mentionAutocomplete.index < 0) {
        chatMode.mentionAutocomplete.index = 0;
    }

    const selectedEntry = chatMode.mentionAutocomplete.matches[chatMode.mentionAutocomplete.index];
    applyMentionReplacement(selectedEntry);
    resetMentionAutocomplete();
    return true;
}

/**
 * Resolve typed @displayname mentions to Matrix user IDs before sending.
 * @param {string} message - Outgoing message text
 * @returns {string} Message with mentions converted to @user:server
 */
function transformOutgoingMentions(message) {
    if (!message || !chatMode.mentionDirectory.length) {
        return message;
    }

    return message.replace(/(^|\s)@([^\s:]+)\b/g, (fullMatch, leadingWhitespace, mentionValue) => {
        const matchedEntry = chatMode.mentionDirectory.find((entry) => {
            return entry.displayName.toLowerCase() === mentionValue.toLowerCase();
        });

        if (!matchedEntry) {
            return fullMatch;
        }

        return `${leadingWhitespace}${matchedEntry.userId}`;
    });
}

/**
 * Build a plain Matrix text payload with canonical mention IDs.
 * @param {string} message - Outgoing raw message
 * @returns {{msgtype: string, body: string}} Matrix content payload
 */
function buildPlainMentionMessageContent(message) {
    return {
        msgtype: 'm.text',
        body: transformOutgoingMentions(message)
    };
}

/**
 * Check whether canonical Matrix mentions exist in text.
 * @param {string} text - Message text
 * @returns {boolean} True when one or more @user:server mentions are present
 */
function hasCanonicalMentions(text) {
    return /@([A-Za-z0-9._\-=\/]+:[A-Za-z0-9.-]+)/.test(text);
}

/**
 * Build formatted HTML body with matrix.to links for mentions.
 * @param {string} resolvedBody - Message body with canonical mention IDs
 * @returns {string} HTML formatted body
 */
function buildFormattedMentionBody(resolvedBody) {
    const mentionRegex = /@([A-Za-z0-9._\-=\/]+:[A-Za-z0-9.-]+)/g;
    return escapeHtml(resolvedBody).replace(mentionRegex, (matchedValue, userBody) => {
        const userId = `@${userBody}`;
        const knownDisplayName = chatMode.displayNames[userId];
        const fallbackDisplayName = userId.split(':')[0].substring(1);
        const displayName = knownDisplayName || fallbackDisplayName;
        const matrixToUrl = `https://matrix.to/#/${userId}`;
        return `<a href="${matrixToUrl}">@${escapeHtml(displayName)}</a>`;
    });
}

/**
 * Build rich mention payload without m.mentions for compatibility fallback.
 * @param {string} message - Outgoing raw message
 * @returns {{msgtype: string, body: string, format?: string, formatted_body?: string}} Matrix content payload
 */
function buildRichMentionFallbackContent(message) {
    const resolvedBody = transformOutgoingMentions(message);
    if (!hasCanonicalMentions(resolvedBody)) {
        return {
            msgtype: 'm.text',
            body: resolvedBody
        };
    }

    return {
        msgtype: 'm.text',
        body: resolvedBody,
        format: 'org.matrix.custom.html',
        formatted_body: buildFormattedMentionBody(resolvedBody)
    };
}

/**
 * Build Matrix message content with mention metadata and formatted HTML.
 * @param {string} message - Outgoing raw message
 * @returns {{msgtype: string, body: string, "m.mentions"?: object, format?: string, formatted_body?: string}} Matrix content payload
 */
function buildMentionMessageContent(message) {
    const resolvedBody = transformOutgoingMentions(message);
    const hasMentions = hasCanonicalMentions(resolvedBody);

    if (!hasMentions) {
        return {
            msgtype: 'm.text',
            body: resolvedBody
        };
    }

    return {
        msgtype: 'm.text',
        body: resolvedBody,
        'm.mentions': {},
        format: 'org.matrix.custom.html',
        formatted_body: buildFormattedMentionBody(resolvedBody)
    };
}

/**
 * Render Matrix user mentions as highlighted @displayname values.
 * @param {string} text - Chat message body
 * @returns {string} Formatted message text for terminal output
 */
function formatChatTextWithMentions(text) {
    if (!text) {
        return '';
    }

    return text.replace(/@([A-Za-z0-9._\-=\/]+:[A-Za-z0-9.-]+)/g, (matchValue, userBody) => {
        const userId = `@${userBody}`;
        const knownDisplayName = chatMode.displayNames[userId];
        const fallbackDisplayName = userId.split(':')[0].substring(1);
        const displayName = knownDisplayName || fallbackDisplayName;
        return `\x1b[1;96m@${displayName}\x1b[0m`;
    });
}

/**
 * Cycle mention suggestions and apply selected display name.
 * @returns {Promise<void>}
 */
async function applyMentionAutocomplete() {
    if (!chatMode.active) {
        return;
    }

    if (chatMode.mentionAutocomplete.matches.length === 0) {
        await refreshMentionSuggestionsFromInput();
        if (chatMode.mentionAutocomplete.matches.length === 0) {
            return;
        }
        chatMode.mentionAutocomplete.index = 0;
    } else {
        chatMode.mentionAutocomplete.index = (chatMode.mentionAutocomplete.index + 1)
            % chatMode.mentionAutocomplete.matches.length;
    }

    const selectedEntry = chatMode.mentionAutocomplete.matches[chatMode.mentionAutocomplete.index];
    applyMentionReplacement(selectedEntry);
    renderMentionSuggestions();
}

// Enter chat mode
async function enterChatMode() {
    if (!window.matrixSession || !window.matrixSession.roomId) {
        term.writeln('\r\n  Error: Not connected to chat. Use "chat" command first.\r\n');
        return;
    }
    
    chatMode.active = true;
    chatMode.messages = [];
    chatMode.lastSync = null;
    chatMode.inputLine = '';
    chatMode.mentionAutocomplete = {
        tokenStart: -1,
        tokenEnd: -1,
        matches: [],
        index: 0
    };
    resetMentionAutocomplete();
    await syncMentionDirectory(true);
    
    term.clear();
    term.writeln('╔════════════════════════════════════════════════════════════╗');
    term.writeln('║              CHAT - #generalchat                           ║');
    term.writeln('║              Type /help for commands                       ║');
    term.writeln('╚════════════════════════════════════════════════════════════╝');
    
    // Fetch initial messages
    await syncChatMessages();

    // Show channel presence checker for litruv account
    const presenceTime = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const litruvPresence = await fetchPublicPresence('https://chat.ruv.wtf', '@litruv:b.ruv.wtf');
    const litruvOnlineText = litruvPresence === 'online' ? 'online' : 'offline';
    term.writeln(`\x1b[90m[${presenceTime}]\x1b[0m \x1b[93mSystem:\x1b[0m @litruv:b.ruv.wtf is ${litruvOnlineText}`);

    // Show nickname setup hint in message history when display name is still default
    const showNicknameHint = await shouldShowNicknameHint();
    if (showNicknameHint) {
        const hintTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        term.writeln(`\x1b[90m[${hintTime}]\x1b[0m \x1b[93mSystem:\x1b[0m You are using a default name. Use /nick [name] to change it.`);
    }
    
    // Start polling for new messages
    chatMode.pollInterval = setInterval(async () => {
        await syncChatMessages(true);
    }, 3000);
    
    // Add separator and initial prompt
    term.writeln('');
    term.writeln('─'.repeat(term.cols || 60));
    term.write('\x1b[1;32m>\x1b[0m ');
    
    // Delay showing input to ensure terminal has rendered and cursor is positioned
    setTimeout(() => {
        showInlineInput();
    }, 50);
    
    updateQuickCommands('chat');
}

// Exit chat mode
function exitChatMode() {
    chatMode.active = false;
    if (chatMode.pollInterval) {
        clearInterval(chatMode.pollInterval);
        chatMode.pollInterval = null;
    }
    chatMode.displayNames = {}; // Clear display name cache
    chatMode.mentionDirectory = [];
    chatMode.mentionLoadedAt = 0;
    resetMentionAutocomplete();
    term.clear();
    term.writeln('  Exited chat mode.');
    writePrompt();
    showInlineInput();
    updateQuickCommands('terminal');
}

/**
 * Update quick command buttons based on context
 * @param {string} mode - 'terminal' or 'chat'
 */
function updateQuickCommands(mode) {
    const container = document.querySelector('.quick-commands');
    const statusLeft = document.querySelector('.status-left');
    if (!container) return;
    
    if (mode === 'chat') {
        if (statusLeft) statusLeft.textContent = 'Chat Mode';
        container.innerHTML = `
            <button class="quick-cmd" onclick="runChatCommand('/help')" title="Show chat help">/help</button>
            <button class="quick-cmd" onclick="runChatCommand('/nick')" title="Change nickname">/nick</button>
            <button class="quick-cmd" onclick="runChatCommand('/quit')" title="Exit chat">/quit</button>
        `;
    } else {
        if (statusLeft) statusLeft.textContent = 'Ready';
        container.innerHTML = `
            <button class="quick-cmd" onclick="runQuickCommand('help')" title="Show all commands">help</button>
            <button class="quick-cmd" onclick="runQuickCommand('about')" title="About this terminal">about</button>
            <button class="quick-cmd" onclick="runQuickCommand('chat')" title="Join chat room">chat</button>
            <button class="quick-cmd" onclick="runQuickCommand('clear')" title="Clear screen">clear</button>
        `;
    }
}

/**
 * Run a chat command from button click
 * @param {string} command - The chat command to run
 */
function runChatCommand(command) {
    if (!chatMode.active) return;
    
    if (command === '/nick') {
        // For /nick, just fill in the command prefix
        inlineInput.value = '/nick ';
        chatMode.inputLine = inlineInput.value;
        resetMentionAutocomplete();
        inlineInput.focus();
        return;
    }
    
    // Execute the command
    inlineInput.value = command;
    submitInlineInput();
}

window.runChatCommand = runChatCommand;

// Sync messages from Matrix
async function syncChatMessages(onlyNew = false) {
    try {
        let endpoint = `/rooms/${window.matrixSession.roomId}/messages?dir=b&limit=50`;
        const data = await matrixApi(endpoint);
        
        if (!data || !data.chunk) return;
        
        const newMessages = [];
        for (const event of data.chunk.reverse()) {
            if (event.type === 'm.room.message' && event.content.msgtype === 'm.text') {
                const msgId = event.event_id;
                const exists = chatMode.messages.find(m => m.id === msgId);
                
                if (!exists) {
                    const timestamp = new Date(event.origin_server_ts);
                    const time = timestamp.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    // Get display name for sender
                    const displayName = await getDisplayName(event.sender);
                    
                    newMessages.push({
                        id: msgId,
                        time: time,
                        sender: displayName,
                        userId: event.sender,
                        text: event.content.body
                    });
                }
            }
        }
        
        if (newMessages.length > 0) {
            chatMode.messages.push(...newMessages);
            
            // Only keep last 100 messages in memory
            if (chatMode.messages.length > 100) {
                chatMode.messages = chatMode.messages.slice(-100);
            }
            
            // Render new messages if in chat mode and only updating
            if (onlyNew && chatMode.active) {
                newMessages.forEach(msg => {
                    renderChatMessage(msg);
                });
            } else if (!onlyNew && chatMode.active) {
                // Initial load - show last 20 messages (simple print, no cursor manipulation)
                const recent = chatMode.messages.slice(-20);
                recent.forEach(msg => {
                    const color = getUserColor(msg.sender);
                    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${formatChatTextWithMentions(msg.text)}`);
                });
            }
        }
        
        chatMode.lastSync = Date.now();
    } catch (error) {
        console.error('Sync error:', error);
    }
}

// Render a chat message (insert above the prompt area)
function renderChatMessage(msg) {
    const color = getUserColor(msg.sender);
    
    // Move up to separator line and clear it and the prompt line
    term.write('\x1b[1A\x1b[2K\r'); // Move up to separator, clear it
    
    // Write the new message
    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${formatChatTextWithMentions(msg.text)}`);
    
    // Redraw separator
    term.writeln('─'.repeat(term.cols || 60));
    
    // Redraw prompt with current input
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
    
    // Scroll to bottom to show new message
    term.scrollToBottom();
    
    // Reposition the inline input after terminal updates
    setTimeout(() => positionInlineInput(), 10);
}

// Render chat input prompt (efficiently)
function renderChatPrompt() {
    // Move to beginning of line, redraw prompt and input
    term.write('\r\x1b[K'); // CR + clear rest of line
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
}

// Send chat message
async function sendChatMessage(message) {
    if (!message.trim()) return;
    
    try {
        await syncMentionDirectory();
        const content = buildMentionMessageContent(message);
        const hasMentions = hasCanonicalMentions(content.body);
        const txnId = Date.now().toString();
        let sendResult = await matrixApi(
            `/rooms/${window.matrixSession.roomId}/send/m.room.message/${txnId}`,
            'PUT',
            content
        );

        if (sendResult && sendResult.errcode && hasMentions) {
            const richFallbackContent = buildRichMentionFallbackContent(message);
            sendResult = await matrixApi(
                `/rooms/${window.matrixSession.roomId}/send/m.room.message/${txnId}-richfallback`,
                'PUT',
                richFallbackContent
            );
        }

        if (sendResult && sendResult.errcode && !hasMentions) {
            const fallbackContent = buildPlainMentionMessageContent(message);
            sendResult = await matrixApi(
                `/rooms/${window.matrixSession.roomId}/send/m.room.message/${txnId}-fallback`,
                'PUT',
                fallbackContent
            );
        }

        if (sendResult && sendResult.errcode) {
            throw new Error(sendResult.error || sendResult.errcode || 'Failed to send message');
        }
        
        // Clear the input
        chatMode.inputLine = '';
        resetMentionAutocomplete();
        renderChatPrompt();
        
        // Reposition input after render
        setTimeout(() => positionInlineInput(), 10);
        
        // Immediately sync to show our message
        setTimeout(() => syncChatMessages(true), 500);
    } catch (error) {
        // Show error above separator
        term.write('\x1b[1A\x1b[2K\r');
        term.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
        term.writeln('─'.repeat(term.cols || 60));
        term.write(`\x1b[1;32m>\x1b[0m `);
        setTimeout(() => positionInlineInput(), 10);
    }
}

// Available commands
const commands = {
    help: {
        description: helpCmd.description,
        execute: (args) => helpCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    about: {
        description: aboutCmd.description,
        execute: (args) => aboutCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    clear: {
        description: clearCmd.description,
        execute: (args) => clearCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    echo: {
        description: echoCmd.description,
        execute: (args) => echoCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    date: {
        description: dateCmd.description,
        execute: (args) => dateCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    whoami: {
        description: whoamiCmd.description,
        execute: (args) => whoamiCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    history: {
        description: historyCmd.description,
        execute: (args) => historyCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    color: {
        description: colorCmd.description,
        execute: (args) => colorCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    banner: {
        description: bannerCmd.description,
        execute: (args) => bannerCmd.execute(term, writeClickable, VERSION, args, commandHistory, welcomeBannerFull, welcomeBannerCompact, welcomeBannerMinimal)
    },
    github: {
        description: githubCmd.description,
        execute: (args) => githubCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    contact: {
        description: contactCmd.description,
        execute: (args) => contactCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    privacy: {
        description: privacyCmd.description,
        execute: (args) => privacyCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    bluesky: {
        description: blueskyCmd.description,
        execute: async (args) => await blueskyCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    chat: {
        description: 'Connect to chat room',
        execute: async (args) => {
            const homeserver = 'https://chat.ruv.wtf';
            const roomAlias = '#generalchat:b.ruv.wtf';
            
            // Generate UUID
            const generateUUID = () => {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            };
            
            // Check if user is providing credentials
            let username = null;
            let password = null;
            let subcommand = args[0];
            let subcommandArgs = args.slice(1);

            // Fetch the latest message without logging in
            if (subcommand === 'last') {
                try {
                    const latest = await fetchPublicLastMessage(homeserver, roomAlias);
                    if (!latest) {
                        return '\r\n  Could not read latest message without login (room may not be public).\r\n';
                    }

                    return `\r\n  #generalchat latest:\r\n  [${latest.time}] ${latest.sender}: ${latest.text}\r\n`;
                } catch (error) {
                    return '\r\n  Error: Failed to fetch latest message without login.\r\n';
                }
            }
            
            // If first arg is not a known subcommand and second arg exists, treat as credentials
            if (args[0] && args[1] && args[0] !== 'send' && args[0] !== 'disconnect' && args[0] !== 'last' && isNaN(parseInt(args[0]))) {
                username = args[0];
                password = args[1];
                subcommand = args[2];
                subcommandArgs = args.slice(3);
            }
            
            // Initialize Matrix session
            if (!window.matrixSession) {
                window.matrixSession = {
                    accessToken: localStorage.getItem('matrix_access_token'),
                    userId: localStorage.getItem('matrix_user_id'),
                    deviceId: localStorage.getItem('matrix_device_id'),
                    roomId: localStorage.getItem('matrix_room_id'),
                    username: localStorage.getItem('matrix_username'),
                    password: localStorage.getItem('matrix_password')
                };
            }
            
            // Register/login user if not logged in
            if (!window.matrixSession.accessToken) {
                try {
                    // Use provided credentials or generate new ones
                    if (!username && window.matrixSession.username && window.matrixSession.password) {
                        username = window.matrixSession.username;
                        password = window.matrixSession.password;
                    } else if (!username) {
                        username = generateUUID();
                        password = generateUUID();
                    }
                    
                    term.writeln('\r\n  Connecting to chat server...\r\n');
                    
                    // Try to register - first attempt to get auth flows
                    let regData = await matrixApi('/register', 'POST', {
                        username: username,
                        password: password
                    });
                    
                    // If we need to complete auth flow (dummy auth)
                    if (regData.flows && !regData.access_token) {
                        term.writeln('  Completing registration...\r\n');
                        regData = await matrixApi('/register', 'POST', {
                            auth: {
                                type: 'm.login.dummy',
                                session: regData.session
                            },
                            username: username,
                            password: password
                        });
                    }
                    
                    if (regData.access_token) {
                        window.matrixSession.accessToken = regData.access_token;
                        window.matrixSession.userId = regData.user_id;
                        window.matrixSession.deviceId = regData.device_id;
                        window.matrixSession.username = username;
                        window.matrixSession.password = password;
                        
                        localStorage.setItem('matrix_access_token', regData.access_token);
                        localStorage.setItem('matrix_user_id', regData.user_id);
                        localStorage.setItem('matrix_device_id', regData.device_id);
                        localStorage.setItem('matrix_username', username);
                        localStorage.setItem('matrix_password', password);
                        
                        term.writeln(`  Registered as: ${regData.user_id}\r\n`);
                    } else if (regData.errcode === 'M_USER_IN_USE') {
                        // Username exists, try to login
                        term.writeln('  Username exists, logging in...\r\n');
                        const loginData = await matrixApi('/login', 'POST', {
                            type: 'm.login.password',
                            identifier: {
                                type: 'm.id.user',
                                user: username
                            },
                            password: password
                        });
                        
                        if (loginData.access_token) {
                            window.matrixSession.accessToken = loginData.access_token;
                            window.matrixSession.userId = loginData.user_id;
                            window.matrixSession.deviceId = loginData.device_id;
                            window.matrixSession.username = username;
                            window.matrixSession.password = password;
                            
                            localStorage.setItem('matrix_access_token', loginData.access_token);
                            localStorage.setItem('matrix_user_id', loginData.user_id);
                            localStorage.setItem('matrix_device_id', loginData.device_id);
                            localStorage.setItem('matrix_username', username);
                            localStorage.setItem('matrix_password', password);
                            
                            term.writeln(`  Logged in as: ${loginData.user_id}\r\n`);
                        } else {
                            return `  Error: Failed to login - ${loginData.error || loginData.errcode || 'Unknown error'}`;
                        }
                    } else {
                        return `  Error: Failed to register account - ${regData.error || regData.errcode || 'Unknown error'}`;
                    }
                } catch (error) {
                    console.error('Chat error:', error);
                    return `  Error: Could not connect to chat server - ${error.message}`;
                }
            }
            
            // Join room if not already joined
            if (!window.matrixSession.roomId) {
                try {
                    term.writeln('  Joining #generalchat...\r\n');
                    
                    // Try joining directly with the room alias
                    const joinData = await matrixApi(`/join/${encodeURIComponent(roomAlias)}`, 'POST', {});
                    
                    if (joinData && joinData.room_id) {
                        window.matrixSession.roomId = joinData.room_id;
                        localStorage.setItem('matrix_room_id', joinData.room_id);
                    } else if (joinData && joinData.errcode) {
                        // If direct join fails, try resolving alias first then joining by room ID
                        term.writeln('  Trying alternate join method...\r\n');
                        
                        const resolveData = await matrixApi(`/directory/room/${encodeURIComponent(roomAlias)}`, 'GET');
                        
                        if (!resolveData || !resolveData.room_id) {
                            return `  Error: Could not find room - ${resolveData?.error || resolveData?.errcode || 'Room not found'}`;
                        }
                        
                        const roomId = resolveData.room_id;
                        
                        // Try POST to /join/{roomId}
                        const joinData2 = await matrixApi(`/join/${encodeURIComponent(roomId)}`, 'POST', {});
                        
                        if (joinData2 && joinData2.room_id) {
                            window.matrixSession.roomId = joinData2.room_id;
                            localStorage.setItem('matrix_room_id', joinData2.room_id);
                        } else if (joinData2 && joinData2.errcode) {
                            return `  Error: Failed to join room - ${joinData2.error || joinData2.errcode}`;
                        } else {
                            window.matrixSession.roomId = roomId;
                            localStorage.setItem('matrix_room_id', roomId);
                        }
                    } else {
                        // Empty response might still be success - try to get room ID from alias
                        const resolveData = await matrixApi(`/directory/room/${encodeURIComponent(roomAlias)}`, 'GET');
                        if (resolveData && resolveData.room_id) {
                            window.matrixSession.roomId = resolveData.room_id;
                            localStorage.setItem('matrix_room_id', resolveData.room_id);
                        } else {
                            return '  Error: Failed to join room - Could not determine room ID';
                        }
                    }
                } catch (error) {
                    console.error('Room join error:', error);
                    return `  Error: Could not join chat room - ${error.message}`;
                }
            }
            
            // Handle subcommands
            if (subcommand === 'disconnect') {
                // Exit chat mode if active
                if (chatMode.active) {
                    if (chatMode.pollInterval) {
                        clearInterval(chatMode.pollInterval);
                    }
                    chatMode.active = false;
                    chatMode.displayNames = {}; // Clear display name cache
                    term.clear();
                }
                
                localStorage.removeItem('matrix_access_token');
                localStorage.removeItem('matrix_user_id');
                localStorage.removeItem('matrix_device_id');
                localStorage.removeItem('matrix_room_id');
                localStorage.removeItem('matrix_username');
                localStorage.removeItem('matrix_password');
                window.matrixSession = null;
                return '\r\n  Disconnected from chat\r\n';
            } else {
                // Enter interactive chat mode (default)
                await enterChatMode();
                return null;
            }
        }
    }
};

// Welcome banner - full size - NFO style
const welcomeBannerFull = [
    '',
    '            ........                                              ',
    '        ...++++++++...                        .........          ',
    '      ...++++++++++++....................  ...+++++++....        ',
    '     ...++++++----++++...+++++++++++++++....+++++++++++...       ',
    '     ..+++++######--++++++++++++++++++++++++++++-----+++..       ',
    '     ..+++++#######-++++++++++++++++++++++++++++######++..       ',
    '     ..-++++#######++++++++++++++++++++++++++++++#####+...       ',
    '      ..-+++++##+++++++++++++++++++++++++++++++++++##+...        ',
    '       ...+++++++++++++++++++++++++++++++++++++++++++...         ',
    '         ...++++++++++++++++----------+++++++-----++++..         ',
    '        ...+++++++++++++++---.....----+####+---..---++-..        ',
    '       ...+++++++++++++++++++.......-#########....+++++...       ',
    '      ...++++++++++++++++++++++++++############+----++++..       ',
    '      ..++++++++++++++++++++++++++###############----+++..       ',
    '     ..++++++++++++++++++++++++++########........----+++-..      ',
    '     ..+++++++++++++++++++++++++########..........#------..      ',
    '    ..+++++++++++++++++++++++++##########........##------..      ',
    '    ..++++++-++++++++++++++++++############....-###------..      ',
    '    ..++++++--+++++++++++++++++#############+.#####---.--..      ',
    '    ..+++++++--+++++++++++++++++#########.......##----....       ',
    '    ..++++++++--+-+++++++++++++++#####+##########----.....       ',
    '    ..+.+++++++----++--++++++++++++############-----...          ',
    '    .....+++++++-----+----+++++++++----------------..            ',
    '    .....++++++++---------------------------------..             ',
    '       ..-+++++++++------------------------------..              ',
    '        ..+++++++++++---------------------------..               ',
    '         ..++++++++++++------------------------..                ',
    '          ..+++++++++--------------------------..                ',
    '           ...+++.-----------------------------..                ',
    '            ....-...---------------------------..                ',
    '              .......---------------------------..               ',
    '                 .  ....----.-------------------..               ',
    '                      .....-.....----------------..              ',
    '                          ..... .....-------------..             ',
    '                               LIT.RUV.WTF TERMINAL v' + VERSION + '            ',
    '',
    '  Type "help" for available commands.',
    '  Use ↑/↓ arrows to navigate command history.',
    ''
].join('\r\n');

// Welcome banner - compact (40 chars wide)
const welcomeBannerCompact = [
    '',
    '     ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    '   ▄█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█▄',
    '  ██░  LIT.RUV.WTF TERMINAL       ░██',
    '  ██░  ═══════════════════════    ░██',
    '  ██░  v' + VERSION + ' ·           Litruv  ░██',
    '   ▀█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█▀',
    '     ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '',
    '  Welcome! Type "help" for commands.',
    ''
].join('\r\n');

// Welcome banner - minimal (25 chars wide)
const welcomeBannerMinimal = [
    '',
    '  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' █░ LIT.RUV.WTF     ░█',
    ' █░ TERMINAL v' + VERSION + ' ░█',
    '  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '',
    '  Type "help"',
    ''
].join('\r\n');

// Get appropriate banner based on terminal width
function getWelcomeBanner() {
    const cols = term.cols;
    const width = window.innerWidth;
    
    // Use minimal mode for very narrow screens
    if (width < 350 || cols < 30) {
        return welcomeBannerMinimal;
    } else if (cols >= 78) {
        return welcomeBannerFull;
    } else if (cols >= 40) {
        return welcomeBannerCompact;
    } else {
        return welcomeBannerMinimal;
    }
}

// Prompt (plain version for display, we handle colors separately)
const promptText = 'user@lit.ruv.wtf $ ';
const promptColored = '\x1b[1;32muser@lit.ruv.wtf\x1b[0m $ ';

/**
 * Write the shell prompt at the current cursor position.
 * @returns {void}
 */
function writePrompt() {
    term.write(promptColored);
}

/**
 * Position the inline input at the cursor location
 */
function positionInlineInput() {
    const terminalEl = document.getElementById('terminal');
    const xtermEl = terminalEl.querySelector('.xterm-screen');
    
    if (!xtermEl) return;
    
    // Get terminal dimensions
    const charWidth = term._core._renderService.dimensions.css.cell.width;
    const charHeight = term._core._renderService.dimensions.css.cell.height;
    
    // Get cursor position
    const cursorY = term.buffer.active.cursorY;
    const cursorX = term.buffer.active.cursorX;
    
    // Position input at cursor (xterm-screen handles positioning)
    inlineInput.style.left = (cursorX * charWidth) + 'px';
    inlineInput.style.top = (cursorY * charHeight) + 'px';
    inlineInput.style.height = charHeight + 'px';
    inlineInput.style.fontSize = term.options.fontSize + 'px';
    inlineInput.style.lineHeight = charHeight + 'px';

    if (mentionSuggestions.style.display !== 'none') {
        mentionSuggestions.style.left = inlineInput.style.left;
        mentionSuggestions.style.top = ((cursorY * charHeight) - charHeight - 6) + 'px';
        mentionSuggestions.style.fontSize = term.options.fontSize + 'px';
        mentionSuggestions.style.lineHeight = charHeight + 'px';
    }
}

/**
 * Show the inline input and position it
 */
function showInlineInput() {
    const terminalEl = document.getElementById('terminal');
    const xtermEl = terminalEl.querySelector('.xterm-screen');
    
    if (xtermEl && !xtermEl.contains(inlineInput)) {
        xtermEl.appendChild(inlineInput);
    }

    if (xtermEl && !xtermEl.contains(mentionSuggestions)) {
        xtermEl.appendChild(mentionSuggestions);
    }
    
    inlineInput.style.display = 'block';
    positionInlineInput();
    inlineInput.focus();
}

/**
 * Hide the inline input
 */
function hideInlineInput() {
    inlineInput.style.display = 'none';
    inlineInput.value = '';
    mentionSuggestions.style.display = 'none';
}

/**
 * Submit current input
 */
async function submitInlineInput() {
    const cmd = inlineInput.value.trim();
    const rawValue = inlineInput.value;
    inlineInput.value = '';
    resetMentionAutocomplete();
    
    // Handle chat mode
    if (chatMode.active) {
        chatMode.inputLine = rawValue;
        if (cmd === '/quit' || cmd === '/exit') {
            hideInlineInput();
            exitChatMode();
            return;
        }
        
        if (cmd === '/help') {
            // Move cursor up to separator, clear it and the prompt
            term.write('\x1b[1A\x1b[2K\r');
            
            term.writeln('\x1b[33mChat Commands:\x1b[0m');
            term.writeln('  /help        - Show this help message');
            term.writeln('  /nick [name] - Change your display name');
            term.writeln('  /quit        - Exit chat mode');
            term.writeln('─'.repeat(term.cols || 60));
            term.write('\x1b[1;32m>\x1b[0m ');
            setTimeout(() => positionInlineInput(), 10);
            return;
        }
        
        if (cmd.startsWith('/nick ')) {
            const newNick = cmd.substring(6).trim();
            
            // Move cursor up to separator, clear it
            term.write('\x1b[1A\x1b[2K\r');
            
            if (!newNick) {
                term.writeln('\x1b[31mError: /nick [name]\x1b[0m');
            } else {
                try {
                    const isTaken = await isDisplayNameTaken(newNick);
                    if (isTaken) {
                        term.writeln('\x1b[31mError: Nickname already in use\x1b[0m');
                    } else {
                        const encodedUserId = encodeURIComponent(window.matrixSession.userId);
                        const putResponse = await matrixApi(`/profile/${encodedUserId}/displayname`, 'PUT', {
                            displayname: newNick
                        });
                        
                        if (putResponse && putResponse.errcode) {
                            term.writeln(`\x1b[31mError: ${putResponse.error || 'Nickname rejected by server'}\x1b[0m`);
                        } else {
                            const verifyData = await matrixApi(`/profile/${encodedUserId}/displayname`, 'GET');
                            const actualName = verifyData && verifyData.displayname;
                            
                            if (actualName === newNick) {
                                chatMode.displayNames[window.matrixSession.userId] = newNick;
                                term.writeln(`\x1b[32mNickname changed to: ${newNick}\x1b[0m`);
                            } else {
                                term.writeln(`\x1b[31mError: Nickname rejected by server\x1b[0m`);
                            }
                        }
                    }
                } catch (error) {
                    term.writeln(`\x1b[31mError: Failed to change nickname\x1b[0m`);
                }
            }
            term.writeln('─'.repeat(term.cols || 60));
            term.write('\x1b[1;32m>\x1b[0m ');
            setTimeout(() => positionInlineInput(), 10);
            return;
        }
        
        if (cmd && !cmd.startsWith('/')) {
            // Don't write the message here - let sync handle it
            await sendChatMessage(cmd);
            return;
        } else if (cmd.startsWith('/')) {
            // Move cursor up to separator, clear it
            term.write('\x1b[1A\x1b[2K\r');
            term.writeln(`\x1b[31mUnknown command: ${cmd.split(' ')[0]}. Type /help\x1b[0m`);
            term.writeln('─'.repeat(term.cols || 60));
            term.write('\x1b[1;32m>\x1b[0m ');
            setTimeout(() => positionInlineInput(), 10);
        } else {
            // Empty message, just reposition the prompt
            setTimeout(() => positionInlineInput(), 10);
        }
        return;
    }
    
    // Normal command mode
    term.write(rawValue + '\r\n');
    
    if (cmd) {
        await executeCommand(cmd);
    }
    
    // Show prompt if not in chat mode
    if (!chatMode.active) {
        writePrompt();
        // Delay to ensure terminal has rendered before positioning
        setTimeout(() => {
            positionInlineInput();
        }, 10);
    }
    
    term.scrollToBottom();
}

// Initialize terminal
async function init() {
    // Display welcome banner with clickable commands
    const cols = term.cols;
    if (cols >= 78) {
        term.writeln(welcomeBannerFull.split('\r\n').slice(0, -3).join('\r\n'));
        writeClickable('  Type [command=help] for available commands.');
        term.writeln('  Use ↑/↓ arrows to navigate command history.');
        term.writeln('');
    } else if (cols >= 40) {
        term.writeln(welcomeBannerCompact.split('\r\n').slice(0, -2).join('\r\n'));
        writeClickable('  Welcome! Type [command=help] for commands.');
        term.writeln('');
    } else {
        term.writeln(welcomeBannerMinimal.split('\r\n').slice(0, -2).join('\r\n'));
        writeClickable('  Type [command=help]');
        term.writeln('');
    }

    await writeStartupChatMotd();
    await attemptStartupSoundPlayback();
    
    writePrompt();
    
    // Add inline input after a short delay to ensure terminal is rendered
    setTimeout(() => {
        showInlineInput();
    }, 100);
    
    // Handle inline input events
    inlineInput.addEventListener('keydown', async (e) => {
        playTerminalKeySound(e);
        if (e.key === 'Escape' && hasVisibleMentionSuggestions()) {
            e.preventDefault();
            resetMentionAutocomplete();
        } else if (e.key === ' ' && hasVisibleMentionSuggestions()) {
            e.preventDefault();
            commitSelectedMentionSuggestion();
        } else if (e.key === 'Enter' && hasVisibleMentionSuggestions()) {
            e.preventDefault();
            commitSelectedMentionSuggestion();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            submitInlineInput();
        } else if (e.key === 'Tab' && chatMode.active) {
            e.preventDefault();
            await applyMentionAutocomplete();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                if (historyIndex === -1 || historyIndex >= commandHistory.length) {
                    historyIndex = commandHistory.length - 1;
                } else if (historyIndex > 0) {
                    historyIndex--;
                }
                inlineInput.value = commandHistory[historyIndex] || '';
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                inlineInput.value = commandHistory[historyIndex] || '';
            } else {
                historyIndex = commandHistory.length;
                inlineInput.value = '';
            }
        }
    });

    inlineInput.addEventListener('input', async () => {
        if (chatMode.active) {
            chatMode.inputLine = inlineInput.value;
            await refreshMentionSuggestionsFromInput();
        }
    });
    
    // Click on terminal focuses input
    document.getElementById('terminal').addEventListener('click', () => {
        if (inlineInput.style.display !== 'none') {
            inlineInput.focus();
        }
    });
    
    // Reposition on resize
    window.addEventListener('resize', () => {
        setTimeout(positionInlineInput, 50);
    });
    
    // Handle scroll to keep input positioned
    term.onScroll(() => {
        positionInlineInput();
    });
}

/**
 * Run a quick command from a button click
 * @param {string} command - The command to execute
 */
async function runQuickCommand(command) {
    if (!command) return;
    
    // Write command to terminal
    term.writeln(`\x1b[1;32m${promptText}\x1b[0m ${command}`);
    
    // Execute the command
    await executeCommand(command.trim());
    
    // Show prompt if not in chat mode
    if (!chatMode.active) {
        writePrompt();
        // Delay to ensure terminal has rendered before positioning
        setTimeout(() => {
            positionInlineInput();
        }, 10);
    }
    
    term.scrollToBottom();
}

// Make function available globally for onclick handlers
window.runQuickCommand = runQuickCommand;

/**
 * Write text to terminal with clickable commands
 * Parses [command=X] syntax to create clickable command links
 * The link provider makes these clickable automatically
 * @param {string} text - Text to write (can include [command=X] syntax)
 * @param {boolean} newline - Whether to add newline after text
 */
function writeClickable(text, newline = true) {
    // Parse for [command=X] syntax
    const regex = /\[command=([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        // Write text before the match
        if (match.index > lastIndex) {
            term.write(text.substring(lastIndex, match.index));
        }
        
        // Write command with underline styling (link provider makes it clickable)
        const command = match[1];
        term.write(`\x1b[4;32m${command}\x1b[0m`);
        
        lastIndex = regex.lastIndex;
    }
    
    // Write remaining text
    if (lastIndex < text.length) {
        term.write(text.substring(lastIndex));
    }
    
    if (newline) {
        term.write('\r\n');
    }
}

// Execute command
async function executeCommand(input) {
    if (!input) return;

    void playSoundFile(TERMINAL_SOUND_FILES.commandLaunch, 0.28);
    
    // Add to history
    commandHistory.push(input);
    historyIndex = commandHistory.length;
    
    // Parse command
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Execute command
    if (commands[cmd]) {
        const output = await commands[cmd].execute(args);
        if (output !== null && output !== undefined) {
            term.writeln(output);
        }
    } else {
        term.writeln(`\r\n  Command not found: ${cmd}`);
        writeClickable('  Type [command=help] for available commands.\r\n');
    }
}

// Initialize when loaded - wait for boot animation first
if (window.runBootAnimation) {
    runBootAnimation().then(init);
} else {
    init();
}
