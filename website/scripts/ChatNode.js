import MxjsClient, { ClientEvents } from 'https://unpkg.com/@litruv/mxjs-lite/dist/mxjs-lite.min.js';
import { ChatCommands } from './ChatCommands.js';
import { ChatAutocomplete } from './ChatAutocomplete.js';

/**
 * Handles chat functionality for a Matrix room using mxjs-lite.
 */
export class ChatNode {
    /** @type {MxjsClient | null} */
    #client = null;

    /** @type {string | null} */
    #roomId = null;

    /** @type {HTMLElement | null} */
    #messagesContainer = null;

    /** @type {HTMLInputElement | null} */
    #messageInput = null;

    /** @type {HTMLElement | null} */
    #statusElement = null;

    /** @type {string} */
    #homeserver = '';

    /** @type {string} */
    #roomAlias = '';

    /** @type {boolean} */
    #isConnected = false;

    /** @type {Map<string, { displayName: string, avatarUrl: string | null }>} */
    #members = new Map();

    /** @type {Set<string>} */
    #renderedEventIds = new Set();

    /** @type {boolean} */
    #isLoadingHistory = false;

    /** @type {((username: string, message: string) => void) | null} */
    #onMessageCallback = null;

    /** @type {ChatCommands | null} */
    #commands = null;

    /** @type {ChatAutocomplete | null} */
    #autocomplete = null;

    /** @type {string} */
    #storageKey = '';

    /** @type {string | (() => string)} */
    #guestName = '';

    /**
     * @param {string} homeserver Matrix homeserver URL
     * @param {string} roomAlias Room alias to join (e.g., #general:matrix.org)
     */
    constructor(homeserver, roomAlias) {
        this.#homeserver = homeserver;
        this.#roomAlias = roomAlias;
        this.#storageKey = `mxjs_chat_${homeserver}_${roomAlias}`;
    }

    /**
     * Get the Matrix client instance for external use
     * @returns {MxjsClient | null}
     */
    getClient() {
        return this.#client;
    }

    /**
     * Set callback for message events
     * @param {(username: string, message: string) => void} callback
     */
    setOnMessage(callback) {
        this.#onMessageCallback = callback;
    }

    /**
     * Get members map for autocomplete
     * @returns {Map<string, { displayName: string | null }>}
     */
    getMembers() {
        return this.#members;
    }

    /**
     * Adds a system message (public for commands)
     * @param {string} text
     */
    addSystemMessage(text) {
        this.#addSystemMessage(text);
    }

    /**
     * Adds an error message (public for commands)
     * @param {string} text
     */
    addErrorMessage(text) {
        this.#addErrorMessage(text);
    }

    /**
     * Initializes the chat node with DOM elements.
     *
     * @param {HTMLElement} messagesContainer Container for messages
     * @param {HTMLInputElement} messageInput Input field for messages
     * @param {HTMLElement} statusElement Status indicator element
     * @param {HTMLElement} inputContainer Input container for autocomplete
     * @param {string} homeserver Homeserver URL (can be empty if provided via connection)
     * @param {string} roomAlias Room alias (can be empty if provided via connection)
     * @param {string | (() => string)} guestName Guest display name or function to resolve it
     */
    initialize(messagesContainer, messageInput, statusElement, inputContainer, homeserver, roomAlias, guestName = '') {
        this.#messagesContainer = messagesContainer;
        this.#messageInput = messageInput;
        this.#statusElement = statusElement;
        this.#guestName = guestName;
        
        // Use provided values or fallback to constructor values
        if (homeserver) this.#homeserver = homeserver;
        if (roomAlias) this.#roomAlias = roomAlias;

        // Setup autocomplete
        this.#autocomplete = new ChatAutocomplete(messageInput, inputContainer);
        this.#autocomplete.setMembersProvider(() => this.getMembers());

        // Setup commands
        this.#commands = new ChatCommands(this);

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.#autocomplete.isVisible) this.#sendMessage();
        });

        this.#updateStatus('disconnected', 'Not connected');
    }

    /**
     * Try to auto-connect with saved credentials
     */
    async #tryAutoConnect() {
        try {
            const saved = localStorage.getItem(this.#storageKey);
            if (!saved) return;
            
            const { accessToken, userId, deviceId } = JSON.parse(saved);
            if (!accessToken || !userId) return;

            this.#updateStatus('connecting', 'Auto-connecting...');

            this.#client = new MxjsClient({ homeserver: this.#homeserver });
            this.#client.accessToken = accessToken;
            this.#client.userId = userId;
            if (deviceId) this.#client.deviceId = deviceId;

            const joinResult = await this.#client.joinRoom(this.#roomAlias);
            if (!joinResult) throw new Error('Failed to join room');

            this.#roomId = joinResult.roomId;
            this.#bindEvents();

            await this.#client.startSync(30000);
            this.#isConnected = true;
            this.#updateStatus('connected', 'Connected');

            this.#addSystemMessage('Connected to chat');
        } catch (error) {
            console.error('Auto-connect failed:', error);
            localStorage.removeItem(this.#storageKey);
            this.#client = null;
        }
    }

    /**
     * Connects to the Matrix homeserver as a guest.
     */
    async #connect() {
        try {
            this.#updateStatus('connecting', 'Connecting...');

            this.#client = new MxjsClient({ homeserver: this.#homeserver });

            const authResult = await this.#client.registerGuest();
            if (!authResult) throw new Error('Guest registration failed');

            // Save credentials
            localStorage.setItem(this.#storageKey, JSON.stringify({
                accessToken: authResult.accessToken,
                userId: authResult.userId,
                deviceId: authResult.deviceId || null
            }));

            // Set display name if provided
            const nameToSet = typeof this.#guestName === 'function' ? this.#guestName() : this.#guestName;
            if (nameToSet?.trim()) {
                console.log('[ChatNode] Setting display name:', nameToSet);
                try {
                    await this.#client.setDisplayName(nameToSet.trim());
                    console.log('[ChatNode] Display name set successfully');
                } catch (e) {
                    console.warn('Failed to set display name:', e);
                }
            } else {
                console.log('[ChatNode] No guest name provided, skipping setDisplayName');
            }

            const joinResult = await this.#client.joinRoom(this.#roomAlias);
            if (!joinResult) throw new Error('Failed to join room');

            this.#roomId = joinResult.roomId;
            this.#bindEvents();

            await this.#client.startSync(30000);
            this.#isConnected = true;
            this.#updateStatus('connected', 'Connected');

            this.#addSystemMessage('Connected to chat');
        } catch (error) {
            console.error(' Chat connection error:', error);
            this.#updateStatus('error', 'Connection failed');
            this.#addErrorMessage(`Connection failed: ${error.message}`);
        }
    }

    /**
     * Reconnects to chat (disconnect and connect again)
     */
    async #reconnect() {
        this.disconnect();
        this.#renderedEventIds.clear();
        if (this.#messagesContainer) this.#messagesContainer.innerHTML = '';
        await this.#connect();
    }

    /**
     * Binds Matrix client events.
     */
    #bindEvents() {
        const c = this.#client;
        if (!c) return;

        c.on(ClientEvents.Ready, () => {
            this.#loadHistory();
        });

        c.on(ClientEvents.MessageCreate, ({ roomId, event }) => {
            if (roomId !== this.#roomId) return;
            // Don't trigger callbacks for messages during history load
            this.#renderMessage(event, this.#isLoadingHistory);
        });

        c.on(ClientEvents.MessageUpdate, ({ roomId, edits, newBody }) => {
            if (roomId !== this.#roomId || !this.#messagesContainer) return;
            const msgEl = this.#messagesContainer.querySelector(`[data-event-id="${edits}"]`);
            if (!msgEl) return;

            const contentEl = msgEl.querySelector('.chat-msg-content');
            if (contentEl) contentEl.textContent = newBody;

            if (!msgEl.querySelector('.chat-msg-edited')) {
                msgEl.appendChild(Object.assign(document.createElement('span'), {
                    className: 'chat-msg-edited',
                    textContent: '(edited)'
                }));
            }
        });

        c.on(ClientEvents.MessageDelete, ({ roomId, redacts }) => {
            if (roomId !== this.#roomId || !this.#messagesContainer) return;
            const msgEl = this.#messagesContainer.querySelector(`[data-event-id="${redacts}"]`);
            if (msgEl) msgEl.classList.add('chat-msg-deleted');
        });

        c.on(ClientEvents.MemberUpdate, ({ roomId, change }) => {
            if (roomId !== this.#roomId) return;
            if (change.type === 'join' || change.type === 'rename') {
                this.#members.set(change.userId, {
                    displayName: change.displayName || this.#extractLocalpart(change.userId),
                    avatarUrl: change.avatarUrl || null
                });
            } else if (change.type === 'leave' || change.type === 'kick' || change.type === 'ban') {
                this.#members.delete(change.userId);
            }
        });
    }

    /**
     * Loads recent message history.
     */
    async #loadHistory() {
        if (!this.#client || !this.#roomId) return;

        this.#isLoadingHistory = true;
        try {
            const members = await this.#client.getJoinedMembers(this.#roomId);
            if (members?.members) {
                for (const m of members.members) {
                    this.#members.set(m.userId, {
                        displayName: m.displayName || this.#extractLocalpart(m.userId),
                        avatarUrl: m.avatarUrl || null
                    });
                }
            }

            const history = await this.#client.getMessages(this.#roomId, { limit: 20 });
            if (!history?.messages) return;

            const messages = [...history.messages].reverse();
            for (const event of messages) {
                if (event.event_id && this.#renderedEventIds.has(event.event_id)) continue;
                if (event.type === 'm.room.message' && event.content?.body) {
                    this.#renderMessage(event, true);
                }
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            this.#isLoadingHistory = false;
        }
    }

    /**
     * Renders a message event.
     *
     * @param {Object} event Matrix message event
     * @param {boolean} isHistorical Whether this is a historical message (don't trigger callback)
     */
    #renderMessage(event, isHistorical = false) {
        if (!this.#messagesContainer || !event.content?.body) return;
        if (event.event_id) {
            if (this.#renderedEventIds.has(event.event_id)) return;
            this.#renderedEventIds.add(event.event_id);
        }

        const member = this.#members.get(event.sender);
        const displayName = member?.displayName || this.#extractLocalpart(event.sender);
        const timestamp = event.origin_server_ts || Date.now();
        const isSelf = event.sender === this.#client?.userId;

        // Trigger onMessage callback only for new messages (not historical)
        if (this.#onMessageCallback && !isSelf && !isHistorical) {
            this.#onMessageCallback(displayName, event.content.body);
        }

        const msgEl = document.createElement('div');
        msgEl.className = `chat-msg ${isSelf ? 'chat-msg-self' : ''}`;
        if (event.event_id) msgEl.dataset.eventId = event.event_id;

        const timeEl = document.createElement('span');
        timeEl.className = 'chat-msg-time';
        timeEl.textContent = this.#formatTime(timestamp);

        const senderEl = document.createElement('span');
        senderEl.className = 'chat-msg-sender';
        senderEl.textContent = displayName;

        const contentEl = document.createElement('span');
        contentEl.className = 'chat-msg-content';
        contentEl.textContent = event.content.body;

        msgEl.append(timeEl, senderEl, contentEl);
        this.#messagesContainer.appendChild(msgEl);
        this.#messagesContainer.scrollTop = this.#messagesContainer.scrollHeight;
    }

    /**
     * Adds a system message.
     *
     * @param {string} text Message text
     */
    #addSystemMessage(text) {
        if (!this.#messagesContainer) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg-system';
        msgEl.textContent = `*** ${text}`;

        this.#messagesContainer.appendChild(msgEl);
        this.#messagesContainer.scrollTop = this.#messagesContainer.scrollHeight;
    }

    /**
     * Adds an error message.
     *
     * @param {string} text Message text
     */
    #addErrorMessage(text) {
        if (!this.#messagesContainer) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg-error';
        msgEl.textContent = `*** ERROR: ${text}`;

        this.#messagesContainer.appendChild(msgEl);
        this.#messagesContainer.scrollTop = this.#messagesContainer.scrollHeight;
    }

    /**
     * Sends a message to the room.
     */
    async #sendMessage() {
        if (!this.#client || !this.#roomId || !this.#messageInput || !this.#isConnected) return;

        const message = this.#messageInput.value.trim();
        if (!message) return;

        this.#messageInput.disabled = true;

        try {
            // Handle commands
            if (message.startsWith('/')) {
                this.#messageInput.value = '';
                await this.#commands?.handle(message);
                return;
            }

            const result = await this.#client.sendMessage(this.#roomId, message);
            if (!result?.eventId) throw new Error('Failed to send message');
            this.#messageInput.value = '';
        } catch (error) {
            console.error('Failed to send message:', error);
            this.#addErrorMessage(`Failed to send: ${error.message}`);
        } finally {
            this.#messageInput.disabled = false;
            this.#messageInput.focus();
        }
    }

    /**
     * Formats a timestamp.
     *
     * @param {number} ts Timestamp in milliseconds
     * @returns {string} Formatted time
     */
    #formatTime(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    /**
     * Extracts the localpart from a Matrix user ID.
     *
     * @param {string} userId Matrix user ID
     * @returns {string} Localpart
     */
    #extractLocalpart(userId) {
        const match = userId.match(/^@([^:]+):/);
        return match ? match[1] : userId;
    }

    /**
     * Updates the status indicator.
     *
     * @param {string} state State (connecting, connected, error, disconnected)
     * @param {string} text Status text
     */
    #updateStatus(state, text) {
        if (!this.#statusElement) return;
        this.#statusElement.className = `chat-status chat-status-${state}`;
        this.#statusElement.textContent = text;
    }

    /**
     * Public method to trigger connection.
     */
    connect() {
        if (this.#client && this.#client.isReady()) {
            console.log('[ChatNode] Already connected');
            return;
        }
        this.#connect();
    }

    /**
     * Checks if the chat is connected.
     *
     * @returns {boolean}
     */
    isConnected() {
        return this.#client?.isReady() ?? false;
    }

    /**
     * Disconnects from the chat.
     */
    disconnect() {
        if (this.#client) {
            this.#client.stopSync();
            this.#client = null;
        }
        this.#isConnected = false;
        this.#roomId = null;
        this.#members.clear();
        this.#updateStatus('disconnected', 'Disconnected');
    }
}
