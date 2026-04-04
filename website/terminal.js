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
import donateCmd from './scripts/commands/donate.js';
import blueskyCmd from './scripts/commands/bluesky.js';
import numbermatchCmd, { gameMode, processGameInput, handleTileClick } from './scripts/commands/numbermatch.js';
import samsayCmd from './scripts/commands/samsay.js';

// Import Matrix client
import {
    initMatrixClient,
    updateClientSession,
    chatMode,
    matrixApi,
    fetchPublicLastMessage,
    fetchPublicPresence,
    formatTimeAgo,
    isDisplayNameTaken,
    hasVisibleMentionSuggestions,
    resetMentionAutocomplete,
    refreshMentionSuggestionsFromInput,
    commitSelectedMentionSuggestion,
    applyMentionAutocomplete,
    enterChatMode,
    exitChatMode,
    updateQuickCommands,
    runChatCommand,
    runGameCommand,
    renderChatPrompt,
    sendChatMessage
} from './matrix-client.js';

/**
 * SAM (Software Automatic Mouth) speech synthesizer instance
 * @type {object|null}
 */
let sam = null;

/**
 * Initialize SAM speech synthesizer with SAM voice
 * @returns {object|null} SAM instance or null if unavailable
 */
function initSam() {
    if (sam) return sam;
    if (typeof SamJs !== 'undefined') {
        // SAM preset: speed=72, pitch=64, mouth=128, throat=128
        sam = new SamJs({ speed: 72, pitch: 64, mouth: 128, throat: 128 });
    }
    return sam;
}

/**
 * Speak text using SAM
 * @param {string} text - Text to speak
 * @returns {void}
 */
function samSpeak(text) {
    const samInstance = initSam();
    if (samInstance) {
        try {
            samInstance.speak(text);
        } catch (_err) {
            // Silently fail if speech doesn't work
        }
    }
}

// Expose samSpeak globally for matrix-client
window.samSpeak = samSpeak;

// Version
const VERSION = '1.0.0';

// Matrix configuration
const IS_NEOCITIES_HOST = window.location.hostname.endsWith('neocities.org');
const MATRIX_CONFIG = {
    homeserver: 'https://chat.ruv.wtf',
    bridgeUrl: 'https://lit.ruv.wtf/matrix-bridge.html',
    useBridge: IS_NEOCITIES_HOST,
    publicReadToken: 'syt_Z2VuZXJhbGNoYXQtcmVhZG9ubHk_sikLltUtfbHlztnanEVm_2icJ1o'
};

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
    fontSize: 20,
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
        const commandNames = ['help', 'about', 'clear', 'echo', 'date', 'whoami', 'history', 'color', 'banner', 'bluesky', 'chat', 'github', 'contact', 'privacy', 'numbermatch'];
        const gameCommandNames = ['add', 'hint', 'new', 'quit'];
        
        // When in game mode, detect clickable tile numbers on board lines
        if (gameMode.active && lineText.includes('│')) {
            // Board line format: "  A │ 5  3  7 ...│"
            // Detect row letter at start
            const rowMatch = lineText.match(/^\s*([A-Z])\s*│/);
            if (rowMatch) {
                const rowLetter = rowMatch[1];
                // Find all digits within the board area (between │ characters)
                const boardStart = lineText.indexOf('│') + 1;
                const boardEnd = lineText.lastIndexOf('│');
                
                if (boardStart > 0 && boardEnd > boardStart) {
                    let col = 0;
                    for (let i = boardStart; i < boardEnd; i++) {
                        const char = lineText[i];
                        // Each cell is 3 chars wide: " X "
                        if ((i - boardStart) % 3 === 1 && /[1-9]/.test(char)) {
                            col = Math.floor((i - boardStart) / 3) + 1;
                            const coord = `${rowLetter}${col}`;
                            links.push({
                                range: {
                                    start: { x: i + 1, y: bufferLineNumber },
                                    end: { x: i + 2, y: bufferLineNumber }
                                },
                                text: char,
                                activate: () => {
                                    handleTileClick(coord);
                                }
                            });
                        }
                    }
                }
            }
        }
        
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

        // When in game mode, register add/hint/new/quit as clickable words on the controls line
        if (gameMode.active) {
            gameCommandNames.forEach(cmd => {
                let startIndex = 0;
                while (true) {
                    const index = lineText.indexOf(cmd, startIndex);
                    if (index === -1) break;
                    const charBefore = index > 0 ? lineText[index - 1] : ' ';
                    const charAfter = index + cmd.length < lineText.length ? lineText[index + cmd.length] : ' ';
                    if (/[\s\[]/.test(charBefore) && /[\s\]]/.test(charAfter)) {
                        const capturedCmd = cmd;
                        links.push({
                            range: {
                                start: { x: index + 1, y: bufferLineNumber },
                                end: { x: index + cmd.length + 1, y: bufferLineNumber }
                            },
                            text: cmd,
                            activate: () => {
                                if (window.runGameCommand) window.runGameCommand(capturedCmd);
                            }
                        });
                    }
                    startIndex = index + 1;
                }
            });
        }
        
        callback(links.length > 0 ? links : undefined);
    }
});

// Adjust font size based on screen width
function adjustFontSize() {
    const width = window.innerWidth;
    if (width < 350) {
        term.options.fontSize = 11;
    } else if (width < 480) {
        term.options.fontSize = 14;
    } else if (width < 768) {
        term.options.fontSize = 17;
    } else {
        term.options.fontSize = 20;
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

// Matrix client - imported from matrix-client.js

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
    donate: {
        description: donateCmd.description,
        execute: (args) => donateCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    bluesky: {
        description: blueskyCmd.description,
        execute: async (args) => await blueskyCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    numbermatch: {
        description: numbermatchCmd.description,
        execute: (args) => {
            numbermatchCmd.execute(term, writeClickable, VERSION, args, commandHistory);
            updateQuickCommands('game');
        }
    },
    samsay: {
        description: samsayCmd.description,
        execute: (args) => samsayCmd.execute(term, writeClickable, VERSION, args, commandHistory)
    },
    chat: {
        description: 'Connect to chat room',
        execute: async (args) => {
            const homeserver = 'https://chat.ruv.wtf';
            const roomAlias = '#generalchat:ruv.wtf';
            
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
            
            // Sync session to mxClient if exists
            if (window.matrixSession.accessToken && window.matrixSession.userId) {
                updateClientSession({ 
                    accessToken: window.matrixSession.accessToken, 
                    userId: window.matrixSession.userId 
                });
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
                        
                        updateClientSession({ accessToken: regData.access_token, userId: regData.user_id });
                        
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
                            
                            updateClientSession({ accessToken: loginData.access_token, userId: loginData.user_id });
                            
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
        
        // Get the actual height of the suggestions box
        const suggestionsHeight = mentionSuggestions.offsetHeight || 0;
        
        // Position it above the cursor line
        mentionSuggestions.style.top = ((cursorY * charHeight) - suggestionsHeight - 6) + 'px';
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
 * Command autocomplete state
 */
const commandAutocomplete = {
    matches: [],
    index: -1,
    tokenStart: 0,
    tokenEnd: 0
};

/**
 * Get command matches for autocomplete
 * @param {string} query - Command prefix to match
 * @param {boolean} isChatMode - Whether in chat mode
 * @returns {Array<{name: string, description: string}>} Matching commands
 */
function getCommandMatches(query, isChatMode) {
    const lowerQuery = query.toLowerCase();
    
    if (isChatMode) {
        // Chat commands
        const chatCommands = [
            { name: '/help', description: 'Show chat commands' },
            { name: '/nick', description: 'Change display name' },
            { name: '/samsay', description: 'Send message with SAM speech' },
            { name: '/quit', description: 'Exit chat mode' }
        ];
        return chatCommands.filter(cmd => cmd.name.startsWith(lowerQuery));
    } else {
        // Terminal commands
        const terminalCommands = Object.keys(commands).map(name => ({
            name,
            description: commands[name].description || ''
        }));
        return terminalCommands.filter(cmd => cmd.name.toLowerCase().startsWith(lowerQuery));
    }
}

/**
 * Check if command suggestions are visible
 * @returns {boolean} True if suggestions are visible
 */
function hasVisibleCommandSuggestions() {
    return mentionSuggestions.style.display !== 'none'
        && commandAutocomplete.matches.length > 0;
}

/**
 * Reset command autocomplete state
 * @returns {void}
 */
function resetCommandAutocomplete() {
    commandAutocomplete.matches = [];
    commandAutocomplete.index = -1;
    commandAutocomplete.tokenStart = 0;
    commandAutocomplete.tokenEnd = 0;
    mentionSuggestions.style.display = 'none';
    mentionSuggestions.innerHTML = '';
}

/**
 * Render command suggestions
 * @returns {void}
 */
function renderCommandSuggestions() {
    const { matches, index } = commandAutocomplete;
    
    if (matches.length === 0) {
        mentionSuggestions.style.display = 'none';
        return;
    }
    
    const limitedMatches = matches.slice(0, 5);
    mentionSuggestions.innerHTML = limitedMatches.map((cmd, i) => {
        const selected = i === index ? ' selected' : '';
        return `<div class="mention-item${selected}">${cmd.name} <span style="opacity: 0.6">- ${cmd.description}</span></div>`;
    }).join('');
    
    mentionSuggestions.style.display = 'block';
    positionInlineInput();
}

/**
 * Refresh command suggestions based on current input
 * @returns {void}
 */
function refreshCommandSuggestions() {
    const value = inlineInput.value;
    const cursorPos = inlineInput.selectionStart;
    
    // Check if we're at the start with a "/" or just typing a command
    const isChatMode = chatMode.active;
    let query = '';
    let tokenStart = 0;
    let tokenEnd = cursorPos;
    
    if (isChatMode) {
        // In chat mode, look for /command at start
        if (value.startsWith('/')) {
            const match = value.match(/^(\/\w*)/);
            if (match && cursorPos <= match[1].length) {
                query = match[1];
                tokenStart = 0;
                tokenEnd = match[1].length;
            } else {
                resetCommandAutocomplete();
                return;
            }
        } else {
            resetCommandAutocomplete();
            return;
        }
    } else {
        // In terminal mode, look for command at start (no slash)
        if (cursorPos === value.length) {
            const match = value.match(/^(\w*)/);
            if (match && match[1].length > 0) {
                query = match[1];
                tokenStart = 0;
                tokenEnd = match[1].length;
            } else {
                resetCommandAutocomplete();
                return;
            }
        } else {
            resetCommandAutocomplete();
            return;
        }
    }
    
    const matches = getCommandMatches(query, isChatMode);
    
    if (matches.length === 0) {
        resetCommandAutocomplete();
        return;
    }
    
    commandAutocomplete.matches = matches;
    commandAutocomplete.index = -1;
    commandAutocomplete.tokenStart = tokenStart;
    commandAutocomplete.tokenEnd = tokenEnd;
    
    renderCommandSuggestions();
}

/**
 * Apply the selected command autocomplete
 * @returns {boolean} True if a command was applied
 */
function applyCommandAutocomplete() {
    if (!hasVisibleCommandSuggestions()) {
        return false;
    }
    
    // Cycle through commands or select first
    if (commandAutocomplete.index < commandAutocomplete.matches.length - 1) {
        commandAutocomplete.index++;
    } else {
        commandAutocomplete.index = 0;
    }
    
    const selected = commandAutocomplete.matches[commandAutocomplete.index];
    const fullValue = inlineInput.value;
    const valueAfter = fullValue.slice(commandAutocomplete.tokenEnd);
    const isChatMode = chatMode.active;
    
    // For chat commands, include the slash; for terminal commands, don't
    const commandText = selected.name;
    const needsSpace = !valueAfter.startsWith(' ') && valueAfter.length > 0;
    const newValue = commandText + (needsSpace ? ' ' : '') + valueAfter;
    const newCursor = commandText.length + (needsSpace ? 1 : 0);
    
    inlineInput.value = newValue;
    inlineInput.setSelectionRange(newCursor, newCursor);
    
    if (isChatMode) {
        chatMode.inputLine = newValue;
    }
    
    // Update token end for continued cycling
    commandAutocomplete.tokenEnd = commandText.length;
    
    renderCommandSuggestions();
    return true;
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
            term.writeln('  /help          - Show this help message');
            term.writeln('  /nick [name]   - Change your display name');
            term.writeln('  /samsay [text] - Send message with SAM speech');
            term.writeln('  /quit          - Exit chat mode');
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
        
        if (cmd.startsWith('/samsay ')) {
            const message = cmd.substring(8).trim();
            
            if (!message) {
                // Move cursor up to separator, clear it
                term.write('\x1b[1A\x1b[2K\r');
                term.writeln('\x1b[31mError: /samsay [text]\x1b[0m');
                term.writeln('─'.repeat(term.cols || 60));
                term.write('\x1b[1;32m>\x1b[0m ');
                setTimeout(() => positionInlineInput(), 10);
                return;
            }
            
            // Send to chat (will play when message comes back)
            await sendChatMessage(cmd);
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
    
    // Handle game mode
    if (gameMode.active) {
        term.write(rawValue + '\r\n');
        const continueGame = processGameInput(term, cmd);
        if (!continueGame) {
            updateQuickCommands('terminal');
            writePrompt();
        }
        setTimeout(() => positionInlineInput(), 10);
        return;
    }
    
    // Normal command mode
    term.write(rawValue + '\r\n');
    
    if (cmd) {
        await executeCommand(cmd);
    }
    
    // Show prompt if not in chat mode or game mode
    // Game mode handles its own prompt in renderBoard
    if (!chatMode.active && !gameMode.active) {
        writePrompt();
        // Delay to ensure terminal has rendered before positioning
        setTimeout(() => {
            positionInlineInput();
        }, 10);
    } else if (gameMode.active) {
        setTimeout(() => positionInlineInput(), 10);
    }
    
    term.scrollToBottom();
}

/**
 * Write startup chat MOTD with last message and presence
 */
async function writeStartupChatMotd() {
    try {
        const result = await Promise.race([
            (async () => {
                const [latest, presence] = await Promise.all([
                    fetchPublicLastMessage('#generalchat:ruv.wtf'),
                    fetchPublicPresence('@lit:ruv.wtf')
                ]);
                return { latest, presence };
            })(),
            new Promise((resolve) => setTimeout(() => resolve({ latest: null, presence: null }), 2500))
        ]);

        if (!result.latest && !result.presence) {
            return;
        }

        if (result.latest) {
            const sender = result.latest.sender.split(':')[0].substring(1);
            const age = formatTimeAgo(result.latest.timestamp);
            term.write(`  \x1b[36m${sender}\x1b[0m: ${result.latest.body.substring(0, 50)}${result.latest.body.length > 50 ? '...' : ''} \x1b[90m(${age})\x1b[0m\r\n`);
        }
        
        if (result.presence) {
            const statusColor = result.presence.presence === 'online' ? '\x1b[32m' : '\x1b[90m';
            const lastActive = result.presence.lastActive > 0 ? formatTimeAgo(Date.now() - result.presence.lastActive) : null;
            term.write(`  \x1b[36mlitruv\x1b[0m ${statusColor}${result.presence.presence}\x1b[0m`);
            if (result.presence.presence !== 'online' && lastActive) {
                term.write(` \x1b[90m(${lastActive})\x1b[0m`);
            }
            term.writeln('');
        }
        
        term.write('  ');
        writeClickable('[command=chat]', 'Run \x1b[32mchat\x1b[0m to join in on the conversation!');
        term.writeln('\r\n');
    } catch (error) {
        // Silently fail - not critical for startup
    }
}

// Initialize terminal
async function init() {
    // Initialize Matrix client with config and dependencies
    initMatrixClient(MATRIX_CONFIG, {
        term,
        inlineInput,
        mentionSuggestions,
        writeClickable,
        writePrompt,
        showInlineInput,
        positionInlineInput,
        submitInlineInput,
        welcomeBannerFull,
        welcomeBannerCompact,
        welcomeBannerMinimal
    });
    
    // Expose chat and game command handlers for onclick buttons
    window.runChatCommand = runChatCommand;
    window.runGameCommand = runGameCommand;
    
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
        
        // Check if we have visible suggestions (mentions OR commands)
        const hasMentions = hasVisibleMentionSuggestions();
        const hasCommands = hasVisibleCommandSuggestions();
        const hasSuggestions = hasMentions || hasCommands;
        
        if (e.key === 'Escape' && hasSuggestions) {
            e.preventDefault();
            if (hasMentions) resetMentionAutocomplete();
            if (hasCommands) resetCommandAutocomplete();
        } else if (e.key === ' ' && hasSuggestions) {
            e.preventDefault();
            if (hasMentions) commitSelectedMentionSuggestion();
            if (hasCommands) {
                resetCommandAutocomplete();
                inlineInput.value += ' ';
                if (chatMode.active) chatMode.inputLine = inlineInput.value;
            }
        } else if (e.key === 'Enter' && hasSuggestions) {
            e.preventDefault();
            if (hasMentions) {
                commitSelectedMentionSuggestion();
            } else if (hasCommands) {
                // Just accept the current command and submit
                resetCommandAutocomplete();
                submitInlineInput();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            submitInlineInput();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (chatMode.active && hasMentions) {
                await applyMentionAutocomplete();
            } else if (hasCommands) {
                applyCommandAutocomplete();
            } else {
                // Trigger command suggestions on Tab
                refreshCommandSuggestions();
                if (hasVisibleCommandSuggestions()) {
                    applyCommandAutocomplete();
                } else if (chatMode.active) {
                    // Try mention autocomplete in chat
                    await applyMentionAutocomplete();
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (hasCommands) {
                // Navigate command suggestions up
                if (commandAutocomplete.index > 0) {
                    commandAutocomplete.index--;
                    renderCommandSuggestions();
                }
            } else if (commandHistory.length > 0) {
                // Navigate command history
                if (historyIndex === -1 || historyIndex >= commandHistory.length) {
                    historyIndex = commandHistory.length - 1;
                } else if (historyIndex > 0) {
                    historyIndex--;
                }
                inlineInput.value = commandHistory[historyIndex] || '';
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (hasCommands) {
                // Navigate command suggestions down
                if (commandAutocomplete.index < commandAutocomplete.matches.length - 1) {
                    commandAutocomplete.index++;
                    renderCommandSuggestions();
                }
            } else if (historyIndex < commandHistory.length - 1) {
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
        
        // Refresh command suggestions if typing at the start
        refreshCommandSuggestions();
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

// Expose sound functions for game modules
window.terminalSounds = {
    files: TERMINAL_SOUND_FILES,
    play: playSoundFile,
    pickRandom: pickRandomValue
};

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
