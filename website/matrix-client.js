/**
 * Matrix Client - Generic Matrix protocol library
 */

// Configuration
let config = {
    homeserver: 'https://matrix.org',
    bridgeUrl: null,
    useBridge: false,
    publicReadToken: null
};

// Dependencies that will be injected
let term, inlineInput, mentionSuggestions, writeClickable, writePrompt, showInlineInput, positionInlineInput, submitInlineInput;

/**
 * Initialize Matrix client with configuration and dependencies
 * @param {Object} userConfig - Configuration options
 * @param {string} userConfig.homeserver - Matrix homeserver URL
 * @param {string} [userConfig.bridgeUrl] - Bridge iframe URL for CSP-restricted hosts
 * @param {boolean} [userConfig.useBridge] - Whether to use iframe bridge
 * @param {string} [userConfig.publicReadToken] - Public read token for unauthenticated requests
 * @param {Object} deps - UI dependencies
 */
export function initMatrixClient(userConfig, deps) {
    // Merge config
    config = { ...config, ...userConfig };
    
    // Inject dependencies
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
}

// Chat mode state
export const chatMode = {
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
    if (!config.bridgeUrl) {
        throw new Error('Bridge URL not configured');
    }
    
    if (matrixBridge.iframe) {
        return matrixBridge.ready;
    }

    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.src = config.bridgeUrl;
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
        }, config.bridgeUrl);
    });
}

/**
 * Handle responses from the Matrix bridge
 */
window.addEventListener('message', (event) => {
    if (config.bridgeUrl && event.origin !== new URL(config.bridgeUrl).origin) {
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
export const matrixApi = async (endpoint, method = 'GET', body = null) => {
    if (!window.matrixSession) return null;
    
    // Use iframe bridge if configured
    if (config.useBridge) {
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

    // Direct API call
    const url = `${config.homeserver}/_matrix/client/r0${endpoint}`;
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
 * Fetch the latest public message from a room
 * @param {string} roomAlias - Room alias (e.g. #room:server.com)
 * @returns {Promise<{sender: string, body: string, timestamp: number} | null>}
 */
export async function fetchPublicLastMessage(roomAlias) {
    if (!config.publicReadToken) {
        console.warn('No public read token configured');
        return null;
    }
    
    try {
        // Use iframe bridge if configured
        if (config.useBridge) {
            if (!matrixBridge.ready) {
                await initMatrixBridge();
            }
            
            const result = await matrixBridgeRequest('matrix:fetchLastMessage', { 
                roomAlias,
                publicToken: config.publicReadToken
            });
            
            if (!result || result.error || !Array.isArray(result.chunk)) {
                return null;
            }
            
            const lastEvent = result.chunk.find(e => 
                e && e.type === 'm.room.message' && e.content && e.content.body
            );
            
            if (!lastEvent) return null;
            
            return {
                sender: lastEvent.sender,
                body: lastEvent.content.body,
                timestamp: lastEvent.origin_server_ts || Date.now()
            };
        }
        
        // Direct API call
        const resolvedAlias = encodeURIComponent(roomAlias);
        const roomResponse = await fetch(
            `${config.homeserver}/_matrix/client/r0/directory/room/${resolvedAlias}`,
            { headers: { 'Authorization': `Bearer ${config.publicReadToken}` } }
        );
        
        if (!roomResponse.ok) return null;
        
        const roomData = await roomResponse.json();
        const roomId = roomData?.room_id;
        if (!roomId) return null;
        
        const messagesResponse = await fetch(
            `${config.homeserver}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
            { headers: { 'Authorization': `Bearer ${config.publicReadToken}` } }
        );
        
        if (!messagesResponse.ok) return null;
        
        const messagesData = await messagesResponse.json();
        const lastEvent = messagesData.chunk?.find(e => 
            e && e.type === 'm.room.message' && e.content && e.content.body
        );
        
        if (!lastEvent) return null;
        
        return {
            sender: lastEvent.sender,
            body: lastEvent.content.body,
            timestamp: lastEvent.origin_server_ts || Date.now()
        };
    } catch (error) {
        console.error('Failed to fetch public last message:', error);
        return null;
    }
}

/**
 * Fetch user presence
 * @param {string} userId - Full Matrix user ID
 * @returns {Promise<{presence: string, lastActive: number} | null>}
 */
export async function fetchPublicPresence(userId) {
    if (!config.publicReadToken) {
        console.warn('No public read token configured');
        return null;
    }
    
    try {
        // Use iframe bridge if configured
        if (config.useBridge) {
            if (!matrixBridge.ready) {
                await initMatrixBridge();
            }
            
            const result = await matrixBridgeRequest('matrix:fetchPresence', { 
                userId,
                publicToken: config.publicReadToken
            });
            
            if (result && !result.error && result.presence) {
                return {
                    presence: result.presence,
                    lastActive: result.last_active_ago || 0
                };
            }
            return null;
        }
        
        // Direct API call
        const response = await fetch(
            `${config.homeserver}/_matrix/client/r0/presence/${encodeURIComponent(userId)}/status`,
            { headers: { 'Authorization': `Bearer ${config.publicReadToken}` } }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        return {
            presence: data.presence,
            lastActive: data.last_active_ago || 0
        };
    } catch (error) {
        console.error('Failed to fetch presence:', error);
        return null;
    }
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
export async function isDisplayNameTaken(newName) {
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
export function commitSelectedMentionSuggestion() {
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
export async function applyMentionAutocomplete() {
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
export function exitChatMode() {
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
        // For /nick, just fill in the command prefix
        inlineInput.value = '/nick ';
        chatMode.inputLine = inlineInput.value;
        resetMentionAutocomplete();
        inlineInput.focus();
        return;
    }
    
    if (command === '/samsay') {
        // For /samsay, just fill in the command prefix
        inlineInput.value = '/samsay ';
        chatMode.inputLine = inlineInput.value;
        resetMentionAutocomplete();
        inlineInput.focus();
        return;
    }
    
    // Execute the command
    inlineInput.value = command;
    submitInlineInput();
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
                    term.writeln(`\x1b[90m[${msg.time}]\x1b[0m ${color}${msg.sender}:\x1b[0m ${formatChatTextWithMentions(msg.text)}`);
                    
                    // If message starts with /samsay, speak it
                    if (msg.text.startsWith('/samsay ')) {
                        const samMessage = msg.text.substring(8).trim();
                        if (samMessage && typeof window.samSpeak === 'function') {
                            window.samSpeak(samMessage);
                        }
                    }
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
    
    // If message starts with /samsay, speak it
    if (msg.text.startsWith('/samsay ')) {
        const samMessage = msg.text.substring(8).trim();
        if (samMessage && typeof window.samSpeak === 'function') {
            window.samSpeak(samMessage);
        }
    }
    
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
export function renderChatPrompt() {
    // Move to beginning of line, redraw prompt and input
    term.write('\r\x1b[K'); // CR + clear rest of line
    term.write(`\x1b[1;32m>\x1b[0m ${chatMode.inputLine}`);
}

// Send chat message
export async function sendChatMessage(message) {
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
