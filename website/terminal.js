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
    if (width < 480) {
        term.options.fontSize = 10;
    } else if (width < 768) {
        term.options.fontSize = 12;
    } else {
        term.options.fontSize = 14;
    }
    fitAddon.fit();
}

adjustFontSize();

// Make terminal responsive
window.addEventListener('resize', () => {
    adjustFontSize();
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
    displayNames: {} // Cache for display names
};

// Matrix API helper
const matrixApi = async (endpoint, method = 'GET', body = null) => {
    if (!window.matrixSession) return null;
    const homeserver = 'https://b.ruv.wtf';
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
    
    term.clear();
    term.writeln('╔════════════════════════════════════════════════════════════╗');
    term.writeln('║              CHAT - #generalchat                           ║');
    term.writeln('║              Type /help for commands                       ║');
    term.writeln('╚════════════════════════════════════════════════════════════╝');
    
    // Fetch initial messages
    await syncChatMessages();
    
    // Start polling for new messages
    chatMode.pollInterval = setInterval(async () => {
        await syncChatMessages(true);
    }, 3000);
    
    // Add separator and initial prompt
    term.writeln('');
    term.writeln('─'.repeat(term.cols || 60));
    term.write('\x1b[1;32m>\x1b[0m ');
    showInlineInput();
}

// Exit chat mode
function exitChatMode() {
    chatMode.active = false;
    if (chatMode.pollInterval) {
        clearInterval(chatMode.pollInterval);
        chatMode.pollInterval = null;
    }
    chatMode.displayNames = {}; // Clear display name cache
    term.clear();
    term.writeln('  Exited chat mode.\r\n');
    term.write(promptColored);
    showInlineInput();
}

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
                    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${msg.text}`);
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
    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${msg.text}`);
    
    // Redraw separator
    term.writeln('─'.repeat(term.cols || 60));
    
    // Redraw prompt with current input
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
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
        const txnId = Date.now();
        await matrixApi(
            `/rooms/${window.matrixSession.roomId}/send/m.room.message/${txnId}`,
            'PUT',
            {
                msgtype: 'm.text',
                body: message
            }
        );
        
        // Clear the input
        chatMode.inputLine = '';
        renderChatPrompt();
        
        // Immediately sync to show our message
        setTimeout(() => syncChatMessages(true), 500);
    } catch (error) {
        // Show error above separator
        term.write('\x1b[1A\x1b[2K\r');
        term.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
        term.writeln('─'.repeat(term.cols || 60));
        term.write(`\x1b[1;32m>\x1b[0m `);
    }
}

// Available commands
const commands = {
    help: {
        description: 'Display available commands',
        execute: () => {
            term.writeln('');
            term.writeln('╔════════════════════════════════════════════════════════════╗');
            term.writeln('║                    AVAILABLE COMMANDS                      ║');
            term.writeln('╚════════════════════════════════════════════════════════════╝');
            term.writeln('');
            writeClickable('  [command=help]      - Display this help message');
            writeClickable('  [command=about]     - Information about this terminal');
            writeClickable('  [command=clear]     - Clear the terminal screen');
            term.writeln('  echo      - Echo back your message (usage: echo [message])');
            writeClickable('  [command=date]      - Display current date and time');
            writeClickable('  [command=whoami]    - Display current user information');
            writeClickable('  [command=history]   - Show command history');
            writeClickable('  [command=color]     - Change terminal color scheme');
            writeClickable('  [command=banner]    - Display welcome banner');
            writeClickable('  [command=bluesky]   - Fetch recent posts from Bluesky');
            writeClickable('  [command=chat]      - Enter interactive chat (type /quit to exit)');
            writeClickable('  [command=github]    - Visit GitHub repository');
            writeClickable('  [command=contact]   - Display contact information');
            writeClickable('  [command=privacy]   - Display privacy policy');
            term.writeln('');
            term.writeln('Navigate: Use ↑/↓ arrows for command history');
            term.writeln('Mouse:    Click commands to run them');
            term.writeln('');
            return null;
        }
    },
    about: {
        description: 'About this terminal',
        execute: () => {
            return [
                '',
                '╔════════════════════════════════════════════════════════════╗',
                '║                   LIT.RUV.WTF TERMINAL                     ║',
                '╚════════════════════════════════════════════════════════════╝',
                '',
                '  A classic terminal interface built with xterm.js',
                '  Features: Keyboard navigation, Mouse support, CRT effects',
                '  Version: ' + VERSION,
                '  Built: ' + new Date().getFullYear(),
                '',
                '  Technologies:',
                '    • xterm.js - Terminal emulator',
                '    • JavaScript - Terminal logic',
                '    • CSS3 - Classic CRT styling',
                ''
            ].join('\r\n');
        }
    },
    clear: {
        description: 'Clear terminal screen',
        execute: () => {
            term.clear();
            return null;
        }
    },
    echo: {
        description: 'Echo back message',
        execute: (args) => {
            return args.join(' ') || '';
        }
    },
    date: {
        description: 'Display current date and time',
        execute: () => {
            const now = new Date();
            return [
                '',
                '  ' + now.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                }),
                '  ' + now.toLocaleTimeString('en-US'),
                ''
            ].join('\r\n');
        }
    },
    whoami: {
        description: 'Display user information',
        execute: () => {
            return [
                '',
                '  User: visitor@lit.ruv.wtf',
                '  Session: ' + Date.now(),
                '  Terminal: xterm.js',
                ''
            ].join('\r\n');
        }
    },
    history: {
        description: 'Show command history',
        execute: () => {
            if (commandHistory.length === 0) {
                return '\r\n  No command history yet.\r\n';
            }
            let output = ['\r\n  Command History:', '  ───────────────'];
            commandHistory.forEach((cmd, idx) => {
                output.push(`  ${(idx + 1).toString().padStart(3, ' ')}  ${cmd}`);
            });
            output.push('');
            return output.join('\r\n');
        }
    },
    color: {
        description: 'Change color scheme',
        execute: (args) => {
            const scheme = args[0] || '';
            const schemes = {
                green: { bg: '#001800', fg: '#00ff00', border: '#0f0' },
                amber: { bg: '#1a0f00', fg: '#ffb000', border: '#ffb000' },
                blue: { bg: '#000818', fg: '#00a0ff', border: '#00a0ff' },
                white: { bg: '#0a0a0a', fg: '#e0e0e0', border: '#999' }
            };
            
            if (!scheme || !schemes[scheme]) {
                return [
                    '',
                    '  Available color schemes:',
                    '    • green  - Classic green terminal',
                    '    • amber  - Amber monochrome',
                    '    • blue   - IBM blue',
                    '    • white  - White phosphor',
                    '',
                    '  Usage: color [scheme]',
                    ''
                ].join('\r\n');
            }
            
            const colors = schemes[scheme];
            term.options.theme.background = colors.bg;
            term.options.theme.foreground = colors.fg;
            document.querySelector('.container').style.borderColor = colors.border;
            document.querySelector('.container').style.background = colors.bg;
            document.body.style.color = colors.fg;
            
            return `\r\n  Color scheme changed to: ${scheme}\r\n`;
        }
    },
    banner: {
        description: 'Display welcome banner',
        execute: () => {
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
            return null;
        }
    },
    github: {
        description: 'Open GitHub repository',
        execute: () => {
            return '\r\n  Opening GitHub...\r\n  (This would open your repository URL)\r\n';
        }
    },
    contact: {
        description: 'Contact information',
        execute: () => {
            return [
                '',
                '  Contact Information:',
                '  ────────────────────',
                '  Email: contact@lit.ruv.wtf',
                '  Web:   https://lit.ruv.wtf',
                ''
            ].join('\r\n');
        }
    },
    privacy: {
        description: 'Privacy policy',
        execute: () => {
            return [
                '',
                '╔════════════════════════════════════════════════════════════╗',
                '║                      PRIVACY POLICY                        ║',
                '╚════════════════════════════════════════════════════════════╝',
                '',
                '  Data Collection:',
                '  ────────────────',
                '  • This terminal uses localStorage to save your chat session',
                '  • Chat messages are stored on our Matrix homeserver',
                '  • No cookies or tracking scripts are used',
                '  • No analytics or third-party tracking',
                '',
                '  Matrix Chat:',
                '  ────────────',
                '  • Chat credentials stored locally in your browser',
                '  • Messages sent through Matrix protocol (b.ruv.wtf)',
                '  • Use "chat disconnect" to clear stored credentials',
                '',
                '  Your Rights:',
                '  ────────────',
                '  • Clear localStorage anytime via browser settings',
                '  • Request data deletion: contact@lit.ruv.wtf',
                '  • All code is open source and auditable',
                '',
                '  Updates: Privacy policy last updated March 2026',
                ''
            ].join('\r\n');
        }
    },
    bluesky: {
        description: 'Fetch recent posts from Bluesky',
        execute: async (args) => {
            const actor = 'lit.mates.dev';
            const limit = args[0] ? parseInt(args[0]) : 5;
            
            try {
                term.writeln('\r\n  Fetching posts from Bluesky...\r\n');
                
                const response = await fetch(
                    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=${limit}`
                );
                
                if (!response.ok) {
                    return '  Error: Unable to fetch Bluesky posts';
                }
                
                const data = await response.json();
                
                if (!data.feed || data.feed.length === 0) {
                    return '  No posts found.';
                }
                
                let output = ['  ╔════════════════════════════════════════════════════╗'];
                output.push('  ║          BLUESKY POSTS - @lit.mates.dev            ║');
                output.push('  ╚════════════════════════════════════════════════════╝');
                output.push('');
                
                // Reverse to show oldest first, latest at bottom
                const reversedFeed = [...data.feed].reverse();
                
                reversedFeed.forEach((item, idx) => {
                    const post = item.post;
                    const text = post.record.text;
                    const createdAt = new Date(post.record.createdAt);
                    const date = createdAt.toLocaleDateString();
                    const time = createdAt.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    
                    // Extract post ID from URI (at://did:plc:xxx/app.bsky.feed.post/{postId})
                    const postId = post.uri.split('/').pop();
                    const postUrl = `https://bsky.app/profile/${actor}/post/${postId}`;
                    
                    output.push(`  [${idx + 1}] ${date} ${time}`);
                    output.push(`  ${postUrl}`);
                    output.push('  ────────────────────────────────────────');
                    
                    // Wrap text to max 50 chars
                    const words = text.split(' ');
                    let line = '  ';
                    words.forEach(word => {
                        if (line.length + word.length + 1 > 52) {
                            output.push(line);
                            line = '  ' + word;
                        } else {
                            line += (line.length > 2 ? ' ' : '') + word;
                        }
                    });
                    if (line.length > 2) output.push(line);
                    
                    output.push('');
                    output.push(`  ♡ ${post.likeCount || 0}  ↻ ${post.repostCount || 0}  💬 ${post.replyCount || 0}`);
                    output.push('');
                });
                
                output.push(`  Usage: bluesky [count] (default: 5, max: 20)`);
                output.push('');
                
                return output.join('\r\n');
            } catch (error) {
                return '  Error: Failed to connect to Bluesky API';
            }
        }
    },
    chat: {
        description: 'Connect to chat room',
        execute: async (args) => {
            const homeserver = 'https://b.ruv.wtf';
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
            
            // If first arg is not a known subcommand and second arg exists, treat as credentials
            if (args[0] && args[1] && args[0] !== 'send' && args[0] !== 'disconnect' && isNaN(parseInt(args[0]))) {
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
                        
                        term.writeln(`  Registered as: @${username}:b.ruv.wtf\r\n`);
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
    ' ██╗     ██╗████████╗██████╗ ██╗   ██╗██╗   ██╗  ██╗    ██╗████████╗███████╗',
    ' ██║     ██║╚══██╔══╝██╔══██╗██║   ██║██║   ██║  ██║    ██║╚══██╔══╝██╔════╝',
    ' ██║     ██║   ██║   ██████╔╝██║   ██║██║   ██║  ██║ █╗ ██║   ██║   █████╗  ',
    ' ██║     ██║   ██║   ██╔══██╗██║   ██║╚██╗ ██╔╝  ██║███╗██║   ██║   ██╔══╝  ',
    ' ███████╗██║   ██║██╗██║  ██║╚██████╔╝ ╚████╔╝██╗╚███╔███╔╝   ██║   ██║     ',
    ' ╚══════╝╚═╝   ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═══╝ ╚═╝ ╚══╝╚══╝    ╚═╝   ╚═╝     ',
    '',
    ' ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
    ' ░░  TERMINAL v' + VERSION + '  ·  EST 2024  ·  LITRUV  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░',
    ' ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
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
    if (cols >= 78) {
        return welcomeBannerFull;
    } else if (cols >= 40) {
        return welcomeBannerCompact;
    } else {
        return welcomeBannerMinimal;
    }
}

// Prompt (plain version for display, we handle colors separately)
const promptText = 'user@lit.ruv.wtf $ ';
const promptColored = '\r\n\x1b[1;32muser@lit.ruv.wtf\x1b[0m $ ';

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
}

/**
 * Submit current input
 */
async function submitInlineInput() {
    const cmd = inlineInput.value.trim();
    const rawValue = inlineInput.value;
    inlineInput.value = '';
    
    // Handle chat mode
    if (chatMode.active) {
        if (cmd === '/quit' || cmd === '/exit') {
            hideInlineInput();
            exitChatMode();
            return;
        }
        
        // Write what user typed
        term.write(rawValue + '\r\n');
        
        if (cmd === '/help') {
            term.writeln('\x1b[33mChat Commands:\x1b[0m');
            term.writeln('  /help        - Show this help message');
            term.writeln('  /nick [name] - Change your display name');
            term.writeln('  /quit        - Exit chat mode');
            term.writeln('─'.repeat(term.cols || 60));
            term.write('\x1b[1;32m>\x1b[0m ');
            positionInlineInput();
            return;
        }
        
        if (cmd.startsWith('/nick ')) {
            const newNick = cmd.substring(6).trim();
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
            positionInlineInput();
            return;
        }
        
        if (cmd && !cmd.startsWith('/')) {
            await sendChatMessage(cmd);
            positionInlineInput();
        } else if (cmd.startsWith('/')) {
            term.writeln(`\x1b[31mUnknown command: ${cmd.split(' ')[0]}. Type /help\x1b[0m`);
            term.writeln('─'.repeat(term.cols || 60));
            term.write('\x1b[1;32m>\x1b[0m ');
            positionInlineInput();
        } else {
            term.write('\x1b[1;32m>\x1b[0m ');
            positionInlineInput();
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
        term.write(promptColored);
        // Delay to ensure terminal has rendered before positioning
        setTimeout(() => {
            positionInlineInput();
        }, 10);
    }
    
    term.scrollToBottom();
}

// Initialize terminal
function init() {
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
    
    term.write(promptColored);
    
    // Add inline input after a short delay to ensure terminal is rendered
    setTimeout(() => {
        showInlineInput();
    }, 100);
    
    // Handle inline input events
    inlineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitInlineInput();
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
        term.write(promptColored);
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
