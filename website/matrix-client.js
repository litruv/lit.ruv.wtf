/**
 * Matrix Client - Using mxjs-lite library
 */

import { MxjsClient } from './mxjs-lite.js';

/**
 * @type {MxjsClient|null}
 */
let mxClient = null;

/**
 * @type {string|null}
 */
let syncToken = null;

// Dependencies that will be injected
let term, inlineInput, mentionSuggestions, writeClickable, writePrompt, showInlineInput, positionInlineInput, submitInlineInput;

/**
 * Initialize Matrix client with configuration and dependencies
 * @param {Object} userConfig - Configuration options
 * @param {string} userConfig.homeserver - Matrix homeserver URL
 * @param {string} [userConfig.publicReadToken] - Public read token for unauthenticated requests
 * @param {Object} deps - UI dependencies
 */
export function initMatrixClient(userConfig, deps) {
    // Create new mxjs-lite client
    mxClient = new MxjsClient({
        homeserver: userConfig.homeserver || 'https://matrix.org',
        publicReadToken: userConfig.publicReadToken || null
    });
    
    // Inject UI dependencies
    if (deps) {
        term = deps.term;
        inlineInput = deps.inlineInput;
        mentionSuggestions = deps.mentionSuggestions;
        writeClickable = deps.writeClickable;
        writePrompt = deps.writePrompt;
        showInlineInput = deps.showInlineInput;
        positionInlineInput = deps.positionInlineInput;
        submitInlineInput = deps.submitInlineInput;
    }
    
    // Set up event handlers
    setupEventHandlers();
}

/**
 * Update mxClient with new session credentials
 * @param {Object} session - Session data with accessToken and userId
 */
export function updateClientSession(session) {
    if (!mxClient) return;
    
    mxClient.accessToken = session.accessToken;
    mxClient.userId = session.userId;
}

/**
 * Setup mxjs-lite event handlers
 */
function setupEventHandlers() {
    if (!mxClient) return;
    
    mxClient.on('message', ({ roomId, event }) => {
        if (!chatMode.active || roomId !== window.matrixSession?.roomId) return;
        handleNewMessage(event);
    });
    
    mxClient.on('edit', ({ roomId, edits, newBody, event }) => {
        if (!chatMode.active || roomId !== window.matrixSession?.roomId) return;
        handleMessageEdit(edits, newBody);
    });
    
    mxClient.on('redaction', ({ roomId, redacts, event }) => {
        if (!chatMode.active || roomId !== window.matrixSession?.roomId) return;
        handleMessageRedaction(redacts);
    });
    
    mxClient.on('typing', ({ roomId, userIds }) => {
        // Can add typing indicators here if needed
    });
}

/**
 * Handle incoming message event
 * @param {Object} event - Matrix message event
 */
function handleNewMessage(event) {
    if (event.content?.msgtype !== 'm.text') return;
    
    const msgId = event.event_id;
    const exists = chatMode.messages.find(m => m.id === msgId);
    if (exists) return;
    
    const timestamp = new Date(event.origin_server_ts);
    const time = timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const userId = event.sender;
    const displayName = chatMode.displayNames[userId] || mxClient.extractLocalpart(userId);
    
    const newMessage = {
        id: msgId,
        time: time,
        sender: displayName,
        userId: userId,
        text: event.content.body
    };
    
    chatMode.messages.push(newMessage);
    
    // Only keep last 100 messages in memory
    if (chatMode.messages.length > 100) {
        chatMode.messages = chatMode.messages.slice(-100);
    }
    
    renderChatMessage(newMessage);
}

/**
 * Handle message edit event
 * @param {string} originalEventId - ID of the original message being edited
 * @param {string} newBody - New message text
 */
function handleMessageEdit(originalEventId, newBody) {
    const message = chatMode.messages.find(m => m.id === originalEventId);
    if (!message) return;
    
    message.text = newBody + ' \x1b[90m(edited)\x1b[0m';
    rerenderChatView();
}

/**
 * Handle message redaction event
 * @param {string} redactedEventId - ID of the message being redacted
 */
function handleMessageRedaction(redactedEventId) {
    const messageIndex = chatMode.messages.findIndex(m => m.id === redactedEventId);
    if (messageIndex === -1) return;
    
    // Remove the message from the array
    chatMode.messages.splice(messageIndex, 1);
    rerenderChatView();
}

/**
 * Re-render the entire chat view
 */
function rerenderChatView() {
    if (!chatMode.active) return;
    
    // Clear terminal and redraw header
    term.clear();
    term.writeln('╔════════════════════════════════════════════════════════════╗');
    term.writeln('║              CHAT - #generalchat                           ║');
    term.writeln('║              Type /help for commands                       ║');
    term.writeln('╚════════════════════════════════════════════════════════════╝');
    
    // Render the last 20 messages
    const recent = chatMode.messages.slice(-20);
    recent.forEach(msg => {
        const color = getUserColor(msg.sender);
        term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${formatChatTextWithMentions(msg.text)}`);
    });
    
    // Render separator and prompt
    term.writeln('');
    term.writeln('─'.repeat(term.cols || 60));
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
    term.scrollToBottom();
    setTimeout(() => positionInlineInput(), 10);
}

// Chat mode state
export const chatMode = {
    active: false,
    messages: [],
    lastSync: null,
    pollInterval: null,
    inputLine: '',
    displayNames: {},
    mentionDirectory: [],
    mentionLoadedAt: 0,
    mentionAutocomplete: {
        tokenStart: -1,
        tokenEnd: -1,
        matches: [],
        index: 0
    }
};

/**
 * Matrix API helper for backward compatibility
 * @param {string} endpoint - API endpoint path
 * @param {string} [method='GET'] - HTTP method
 * @param {Object|null} [body=null] - Request body
 * @returns {Promise<Object>} API response
 */
export const matrixApi = async (endpoint, method = 'GET', body = null) => {
    if (!mxClient) return null;
    
    const accessToken = window.matrixSession?.accessToken || null;
    return await mxClient.api(endpoint, method, body, accessToken);
};

/**
 * Fetch the latest public message from a room
 * @param {string} roomAlias - Room alias (e.g. #room:server.com)
 * @returns {Promise<{sender: string, body: string, timestamp: number} | null>}
 */
export async function fetchPublicLastMessage(roomAlias) {
    if (!mxClient) return null;
    return await mxClient.fetchPublicLastMessage(roomAlias);
}

/**
 * Fetch user presence
 * @param {string} userId - Full Matrix user ID
 * @returns {Promise<{presence: string, lastActive: number} | null>}
 */
export async function fetchPublicPresence(userId) {
    if (!mxClient) return null;
    const result = await mxClient.fetchPublicPresence(userId);
    return result ? { presence: result.presence, lastActive: result.lastActive } : null;
}

/**
 * Format a unix-millisecond timestamp as relative age text.
 * @param {number} timestampMs - Epoch timestamp in milliseconds
 * @returns {string} Relative time label
 */
export function formatTimeAgo(timestampMs) {
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
 * Get display name for a user (with caching)
 * @param {string} userId - Matrix user ID
 * @returns {Promise<string>} Display name
 */
async function getDisplayName(userId) {
    if (chatMode.displayNames[userId]) {
        return chatMode.displayNames[userId];
    }
    
    if (!mxClient) {
        const fallback = userId.split(':')[0].substring(1);
        chatMode.displayNames[userId] = fallback;
        return fallback;
    }
    
    try {
        const profile = await mxClient.getProfile(userId);
        const displayName = profile?.displayName || mxClient.extractLocalpart(userId);
        chatMode.displayNames[userId] = displayName;
        return displayName;
    } catch (error) {
        const fallback = mxClient.extractLocalpart(userId);
        chatMode.displayNames[userId] = fallback;
        return fallback;
    }
}

/**
 * Get color for user based on their ID (consistent hashing)
 * @param {string} username - Username string
 * @returns {string} ANSI color code
 */
function getUserColor(username) {
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
    
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = ((hash << 5) - hash) + username.charCodeAt(i);
        hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Check if display name is already taken
 * @param {string} newName - Proposed display name
 * @returns {Promise<boolean>} True if taken
 */
export async function isDisplayNameTaken(newName) {
    if (!mxClient || !window.matrixSession?.roomId) return false;
    
    try {
        const members = await mxClient.getRoomMembers(window.matrixSession.roomId);
        if (!members) return false;
        
        for (const member of members) {
            if (member.userId === window.matrixSession.userId) continue;
            if (member.displayName.toLowerCase() === newName.toLowerCase()) {
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking display names:', error);
        return false;
    }
}

/**
 * Determine if a Matrix display name appears unchanged/default.
 * @param {string} displayName - Current display name
 * @returns {boolean} True when name looks like an auto-generated default
 */
function isDefaultDisplayName(displayName) {
    if (!displayName) return true;
    
    const trimmedName = displayName.trim();
    if (!trimmedName) return true;
    
    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Pattern.test(trimmedName);
}

/**
 * Check whether to show a nickname setup hint for the current user.
 * @returns {Promise<boolean>} True when the user should be prompted to change nickname
 */
async function shouldShowNicknameHint() {
    if (!mxClient || !window.matrixSession?.userId) return false;
    
    try {
        const profile = await mxClient.getProfile(window.matrixSession.userId);
        return isDefaultDisplayName(profile?.displayName || '');
    } catch (error) {
        return false;
    }
}

/**
 * Sync mention directory for autocomplete and mention rendering.
 * @param {boolean} [force=false] - When true, bypass cache time
 * @returns {Promise<void>}
 */
async function syncMentionDirectory(force = false) {
    if (!mxClient || !window.matrixSession?.roomId) return;
    
    const now = Date.now();
    if (!force && chatMode.mentionDirectory.length > 0 && (now - chatMode.mentionLoadedAt) < 30000) {
        return;
    }
    
    try {
        const members = await mxClient.getRoomMembers(window.matrixSession.roomId);
        if (!members) return;
        
        const directory = [];
        for (const member of members) {
            chatMode.displayNames[member.userId] = member.displayName;
            directory.push({ userId: member.userId, displayName: member.displayName });
        }
        
        chatMode.mentionDirectory = directory;
        chatMode.mentionLoadedAt = now;
    } catch (error) {
        console.warn('Failed to sync mention directory:', error);
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
    
    if (tokenStart === -1) return null;
    
    const atIndex = textBeforeCursor.indexOf('@', tokenStart);
    if (atIndex === -1) return null;
    
    const tokenText = textBeforeCursor.slice(atIndex + 1);
    if (!tokenText || tokenText.includes(':')) return null;
    
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
export function hasVisibleMentionSuggestions() {
    return chatMode.active
        && mentionSuggestions.style.display !== 'none'
        && chatMode.mentionAutocomplete.matches.length > 0;
}

/**
 * Hide mention suggestion UI and clear state.
 * @returns {void}
 */
export function resetMentionAutocomplete() {
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
export async function refreshMentionSuggestionsFromInput() {
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
    if (rangeStart < 0 || rangeEnd < 0) return;
    
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
export function commitSelectedMentionSuggestion() {
    if (!hasVisibleMentionSuggestions()) return false;
    
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
    if (!message || !chatMode.mentionDirectory.length) return message;
    
    return message.replace(/(^|\s)@([^\s:]+)\b/g, (fullMatch, leadingWhitespace, mentionValue) => {
        const matchedEntry = chatMode.mentionDirectory.find((entry) => {
            return entry.displayName.toLowerCase() === mentionValue.toLowerCase();
        });
        
        if (!matchedEntry) return fullMatch;
        
        return `${leadingWhitespace}${matchedEntry.userId}`;
    });
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
 * Build Matrix message content with mention metadata and formatted HTML.
 * @param {string} message - Outgoing raw message
 * @returns {Object} Matrix content payload
 */
function buildMentionMessageContent(message) {
    const resolvedBody = transformOutgoingMentions(message);
    const hasMentions = hasCanonicalMentions(resolvedBody);
    
    if (!hasMentions) {
        return { msgtype: 'm.text', body: resolvedBody };
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
    if (!text) return '';
    
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
export async function applyMentionAutocomplete() {
    if (!chatMode.active) return;
    
    if (chatMode.mentionAutocomplete.matches.length === 0) {
        await refreshMentionSuggestionsFromInput();
        if (chatMode.mentionAutocomplete.matches.length === 0) return;
        chatMode.mentionAutocomplete.index = 0;
    } else {
        chatMode.mentionAutocomplete.index = (chatMode.mentionAutocomplete.index + 1)
            % chatMode.mentionAutocomplete.matches.length;
    }
    
    const selectedEntry = chatMode.mentionAutocomplete.matches[chatMode.mentionAutocomplete.index];
    applyMentionReplacement(selectedEntry);
    renderMentionSuggestions();
}

/**
 * Enter chat mode
 * @returns {Promise<void>}
 */
export async function enterChatMode() {
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
    
    // Show nickname setup hint in message history when display name is still default
    const showNicknameHint = await shouldShowNicknameHint();
    if (showNicknameHint) {
        const hintTime = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        term.writeln(`\x1b[90m[${hintTime}]\x1b[0m \x1b[93mSystem:\x1b[0m You are using a default name. Use /nick [name] to change it.`);
    }
    
    // Start sync loop
    startSyncLoop();
    
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

/**
 * Start Matrix sync loop
 */
function startSyncLoop() {
    if (!mxClient) return;
    
    chatMode.pollInterval = setInterval(async () => {
        try {
            const data = await mxClient.sync(syncToken, 10000);
            if (data) {
                syncToken = data.next_batch;
                mxClient.processSyncData(data);
            }
        } catch (error) {
            console.error('Sync error:', error);
        }
    }, 3000);
}

/**
 * Sync messages from Matrix (initial load)
 * @param {boolean} [onlyNew=false] - Only fetch new messages
 * @returns {Promise<void>}
 */
async function syncChatMessages(onlyNew = false) {
    if (!mxClient || !window.matrixSession?.roomId) return;
    
    try {
        const result = await mxClient.getMessages(window.matrixSession.roomId, { limit: 50, dir: 'b' });
        if (!result || !result.messages) return;
        
        const newMessages = [];
        for (const event of result.messages.reverse()) {
            if (event.type === 'm.room.message' && event.content?.msgtype === 'm.text') {
                const msgId = event.event_id;
                const exists = chatMode.messages.find(m => m.id === msgId);
                
                if (!exists) {
                    const timestamp = new Date(event.origin_server_ts);
                    const time = timestamp.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
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
            
            if (chatMode.messages.length > 100) {
                chatMode.messages = chatMode.messages.slice(-100);
            }
            
            if (!onlyNew && chatMode.active) {
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

/**
 * Render a chat message (insert above the prompt area)
 * @param {Object} msg - Message object
 */
function renderChatMessage(msg) {
    const color = getUserColor(msg.sender);
    
    term.write('\x1b[1A\x1b[2K\r');
    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${formatChatTextWithMentions(msg.text)}`);
    
    if (msg.text.startsWith('/samsay ')) {
        const samMessage = msg.text.substring(8).trim();
        if (samMessage && typeof window.samSpeak === 'function') {
            window.samSpeak(samMessage);
        }
    }
    
    term.writeln('─'.repeat(term.cols || 60));
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
    term.scrollToBottom();
    setTimeout(() => positionInlineInput(), 10);
}

/**
 * Exit chat mode
 */
export function exitChatMode() {
    chatMode.active = false;
    if (chatMode.pollInterval) {
        clearInterval(chatMode.pollInterval);
        chatMode.pollInterval = null;
    }
    chatMode.displayNames = {};
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
export function updateQuickCommands(mode) {
    const container = document.querySelector('.quick-commands');
    const statusLeft = document.querySelector('.status-left');
    if (!container) return;
    
    if (mode === 'chat') {
        if (statusLeft) statusLeft.textContent = 'Chat Mode';
        container.innerHTML = `
            <button class="quick-cmd" onclick="runChatCommand('/help')" title="Show chat help">/help</button>
            <button class="quick-cmd" onclick="runChatCommand('/nick')" title="Change nickname">/nick</button>
            <button class="quick-cmd" onclick="runChatCommand('/samsay')" title="SAM speech">/samsay</button>
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
export function runChatCommand(command) {
    if (!chatMode.active) return;
    
    if (command === '/nick') {
        inlineInput.value = '/nick ';
        chatMode.inputLine = inlineInput.value;
        resetMentionAutocomplete();
        inlineInput.focus();
        return;
    }
    
    if (command === '/samsay') {
        inlineInput.value = '/samsay ';
        chatMode.inputLine = inlineInput.value;
        resetMentionAutocomplete();
        inlineInput.focus();
        return;
    }
    
    inlineInput.value = command;
    submitInlineInput();
}

/**
 * Render chat input prompt (efficiently)
 */
export function renderChatPrompt() {
    term.write('\r\x1b[K');
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
}

/**
 * Send chat message
 * @param {string} message - Message to send
 * @returns {Promise<void>}
 */
export async function sendChatMessage(message) {
    if (!message.trim()) return;
    if (!mxClient || !window.matrixSession?.roomId) return;
    
    try {
        await syncMentionDirectory();
        const content = buildMentionMessageContent(message);
        
        const result = await mxClient.sendMessage(
            window.matrixSession.roomId,
            content.body,
            content.formatted_body || null
        );
        
        if (!result) {
            throw new Error('Failed to send message');
        }
        
        chatMode.inputLine = '';
        resetMentionAutocomplete();
        renderChatPrompt();
        setTimeout(() => positionInlineInput(), 10);
    } catch (error) {
        term.write('\x1b[1A\x1b[2K\r');
        term.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
        term.writeln('─'.repeat(term.cols || 60));
        term.write(`\x1b[1;32m>\x1b[0m `);
        setTimeout(() => positionInlineInput(), 10);
    }
}
