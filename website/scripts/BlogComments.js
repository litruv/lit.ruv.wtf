import MxjsClient, { ClientEvents } from "https://unpkg.com/@litruv/mxjs-lite/dist/mxjs-lite.min.js";

/**
 * Matrix-backed comments and reactions for static blog posts.
 */
export class BlogComments {
    /** @type {string} */
    #homeserver;

    /** @type {string} */
    #roomAlias;

    /** @type {string} */
    #postSlug;

    /** @type {MxjsClient | null} */
    #client = null;

    /** @type {string | null} */
    #roomId = null;

    /** @type {string | null} */
    #threadRootEventId = null;

    /** @type {HTMLElement | null} */
    #root = null;

    /** @type {HTMLElement | null} */
    #statusEl = null;

    /** @type {HTMLElement | null} */
    #listEl = null;

    /** @type {HTMLElement | null} */
    #postReactionsEl = null;

    /** @type {HTMLInputElement | null} */
    #inputEl = null;

    /** @type {HTMLButtonElement | null} */
    #sendBtn = null;

    /** @type {Map<string, { name: string }>} */
    #members = new Map();

    /** @type {Map<string, { itemEl: HTMLElement, senderEl: HTMLElement, bodyEl: HTMLElement, body: string, sender: string }>} */
    #commentEventMap = new Map();

    /** @type {Map<string, { targetEventId: string, key: string, sender: string }>} */
    #reactionEventMap = new Map();

    /** @type {Map<string, string>} */
    #ownReactionByTargetAndKey = new Map();

    /** @type {Map<string, HTMLElement>} */
    #reactionChipMap = new Map();

    /** @type {Map<string, HTMLButtonElement>} */
    #reactionBtnMap = new Map();

    /** @type {Set<string>} */
    #seenEvents = new Set();

    /** @type {boolean} */
    #isConnected = false;

    /** @type {boolean} */
    #historyLoaded = false;

    /** @type {boolean} */
    #hasAutoReconnected = false;

    /** @type {Record<string, any>[]} */
    #pendingEvents = [];

    /** @type {string | null} */
    #displayName = null;

    /** @type {HTMLElement | null} */
    #identityEl = null;

    /** @type {number | null} */
    #nickCooldownTimer = null;

    /** @type {{ firstParts: string[], secondParts: string[] } | null} */
    static #nameParts = null;

    /** @type {Promise<void> | null} */
    static #namePartsPromise = null;

    /** @type {string[]} */
    static #reactionChoices = ["👍", "❤️", "🔥", "😂", "👀"];

    /**
     * @param {{ homeserver: string, roomAlias: string, postSlug: string }} options
     */
    constructor(options) {
        this.#homeserver = options.homeserver;
        this.#roomAlias = options.roomAlias;
        this.#postSlug = options.postSlug;
    }

    /**
     * Mounts comments UI and starts Matrix connection flow.
     *
     * @param {HTMLElement} mountEl
     * @returns {Promise<void>}
     */
    async initialize(mountEl) {
        this.#root = mountEl;
        this.#renderShell();
        await this.#connect();
    }

    /**
     * Returns the localStorage key used for Matrix auth session.
     *
     * @returns {string}
     */
    #sessionKey() {
        return `mxjs_blog_comments_session_${this.#homeserver}_${this.#roomAlias}`;
    }

    /**
     * Returns the localStorage key used to store the user's chosen display name.
     *
     * @returns {string}
     */
    #customNameKey() {
        return `mxjs_blog_comments_name_${this.#homeserver}`;
    }

    /**
     * Returns the stable thread marker used to identify this post thread root.
     *
     * @returns {string}
     */
    #threadMarker() {
        return `[blog-thread:${this.#postSlug}]`;
    }

    /**
     * Returns the root body text used when creating a post thread.
     *
     * @returns {string}
     */
    #threadRootBody() {
        return `${this.#threadMarker()} /blog/${this.#postSlug}/`;
    }

    /**
     * Creates the base comments UI.
     *
     * @returns {void}
     */
    #renderShell() {
        if (!this.#root) return;

        const sectionTitle = document.createElement("h2");
        sectionTitle.className = "blog-comments-title";
        sectionTitle.textContent = "Comments";

        const status = document.createElement("p");
        status.className = "blog-comments-status";
        status.textContent = "Connecting...";

        const postActions = document.createElement("div");
        postActions.className = "blog-post-reactions-actions";
        for (const emoji of BlogComments.#reactionChoices) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "blog-reaction-btn";
            btn.setAttribute("aria-label", `React to post with ${emoji}`);
            btn.addEventListener("click", () => this.#togglePostReaction(emoji));

            const emojiSpan = document.createElement("span");
            emojiSpan.className = "blog-reaction-btn-emoji";
            emojiSpan.textContent = emoji;

            const countSpan = document.createElement("span");
            countSpan.className = "blog-reaction-btn-count is-hidden";

            btn.append(emojiSpan, countSpan);
            postActions.appendChild(btn);
            this.#reactionBtnMap.set(emoji, btn);
        }

        const list = document.createElement("div");
        list.className = "blog-comments-list";
        list.setAttribute("aria-live", "polite");

        const identity = document.createElement("div");
        identity.className = "blog-comments-identity is-hidden";

        const composer = document.createElement("div");
        composer.className = "blog-comments-composer";

        const input = document.createElement("input");
        input.className = "blog-comments-input";
        input.type = "text";
        input.placeholder = "Write a comment...";
        input.maxLength = 1000;

        const sendBtn = document.createElement("button");
        sendBtn.className = "blog-comments-send";
        sendBtn.type = "button";
        sendBtn.textContent = "Send";

        composer.append(input, sendBtn);

        this.#root.innerHTML = "";
        this.#root.append(postActions, sectionTitle, status, list, identity, composer);

        this.#statusEl = status;
        this.#postReactionsEl = postActions;
        this.#listEl = list;
        this.#identityEl = identity;
        this.#inputEl = input;
        this.#sendBtn = sendBtn;

        sendBtn.addEventListener("click", () => {
            this.#sendComment();
        });

        input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            this.#sendComment();
        });
    }

    /**
     * Renders the "Commenting as [name] ✏️" identity bar.
     *
     * @returns {void}
     */
    #renderIdentity() {
        if (!this.#identityEl || !this.#displayName) return;

        this.#identityEl.innerHTML = "";
        this.#identityEl.classList.remove("is-hidden");

        const label = document.createElement("span");
        label.className = "blog-comments-identity-label";
        label.textContent = "Commenting as ";

        const nameSpan = document.createElement("strong");
        nameSpan.className = "blog-comments-identity-name";
        nameSpan.textContent = this.#displayName;

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "blog-comments-identity-edit-btn";
        editBtn.setAttribute("aria-label", "Edit display name");

        const remaining = this.#nickCooldownRemaining();
        if (remaining > 0) {
            editBtn.disabled = true;
            editBtn.title = `Wait ${remaining}s before changing name again`;
            editBtn.textContent = `✏️ ${remaining}s`;
            this.#startCooldownTick(editBtn);
        } else {
            editBtn.title = "Edit display name";
            editBtn.textContent = "✏️";
            editBtn.addEventListener("click", () => this.#startEditName());
        }

        this.#identityEl.append(label, nameSpan, editBtn);
    }

    /**
     * Ticks the countdown text on the edit button without rebuilding the DOM.
     *
     * @param {HTMLButtonElement} editBtn
     * @returns {void}
     */
    #startCooldownTick(editBtn) {
        if (this.#nickCooldownTimer !== null) clearInterval(this.#nickCooldownTimer);
        this.#nickCooldownTimer = setInterval(() => {
            const remaining = this.#nickCooldownRemaining();
            if (remaining <= 0) {
                clearInterval(this.#nickCooldownTimer);
                this.#nickCooldownTimer = null;
                editBtn.disabled = false;
                editBtn.title = "Edit display name";
                editBtn.textContent = "✏️";
                editBtn.addEventListener("click", () => this.#startEditName());
            } else {
                editBtn.textContent = `✏️ ${remaining}s`;
                editBtn.title = `Wait ${remaining}s before changing name again`;
            }
        }, 1000);
    }

    /**
     * Returns the localStorage key used to store nick-change timestamp.
     *
     * @returns {string}
     */
    #nickCooldownKey() {
        return `mxjs_blog_comments_nick_ts_${this.#homeserver}`;
    }

    /**
     * Returns seconds remaining on the nick-change cooldown, or 0 if not cooling down.
     *
     * @returns {number}
     */
    #nickCooldownRemaining() {
        const stored = localStorage.getItem(this.#nickCooldownKey());
        if (!stored) return 0;
        const ts = Number(stored);
        if (!ts) return 0;
        const elapsed = Math.floor((Date.now() - ts) / 1000);
        return Math.max(0, 60 - elapsed);
    }

    /**
     * Replaces the name display with an inline edit input.
     *
     * @returns {void}
     */
    #startEditName() {
        if (!this.#identityEl || !this.#displayName) return;

        this.#identityEl.innerHTML = "";

        const label = document.createElement("span");
        label.className = "blog-comments-identity-label";
        label.textContent = "Commenting as ";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "blog-comments-identity-input";
        input.value = this.#displayName;
        input.maxLength = 64;
        input.setAttribute("aria-label", "Display name");

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "blog-comments-identity-save-btn";
        saveBtn.textContent = "Save";

        const confirm = () => {
            const newName = input.value.trim();
            console.log("[BlogComments] confirm name edit:", { newName, current: this.#displayName });
            if (newName && newName !== this.#displayName) {
                this.#saveDisplayName(newName);
            } else {
                this.#renderIdentity();
            }
        };

        saveBtn.addEventListener("click", confirm);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") { event.preventDefault(); confirm(); }
            if (event.key === "Escape") { this.#renderIdentity(); }
        });

        this.#identityEl.append(label, input, saveBtn);
        input.focus();
        input.select();
    }

    /**
     * Saves a new display name, persists to localStorage, and updates the Matrix profile.
     *
     * @param {string} newName
     * @returns {Promise<void>}
     */
    async #saveDisplayName(newName) {
        if (!this.#client || !newName) return;

        console.log("[BlogComments] saving display name:", newName);

        this.#displayName = newName;
        localStorage.setItem(this.#customNameKey(), newName);

        const nowTs = Date.now();
        localStorage.setItem(this.#nickCooldownKey(), String(nowTs));
        if (this.#nickCooldownTimer !== null) clearInterval(this.#nickCooldownTimer);
        this.#nickCooldownTimer = null;

        if (this.#client?.userId) {
            this.#members.set(this.#client.userId, { name: newName });
        }

        this.#renderIdentity();
        this.#updateOwnRenderedNames(newName);

        try {
            const ok = await this.#client.setDisplayName(newName);
            console.log("[BlogComments] setDisplayName result:", ok);
            if (!ok) console.warn("[BlogComments] setDisplayName returned falsy — may have been blocked by server");
        } catch (error) {
            console.warn("[BlogComments] Failed to update display name", error);
        }
    }

    /**
     * Updates the displayed author name on all comments sent by the current user.
     *
     * @param {string} newName
     * @returns {void}
     */
    #updateOwnRenderedNames(newName) {
        if (!this.#client?.userId) return;
        for (const entry of this.#commentEventMap.values()) {
            if (entry.sender === this.#client.userId) {
                entry.senderEl.textContent = newName;
            }
        }
    }

    /**
     * Updates connection status text.
     *
     * @param {string} text
     * @param {"idle" | "ok" | "error"} tone
     * @returns {void}
     */
    #setStatus(text, tone = "idle") {
        if (!this.#statusEl) return;
        this.#statusEl.textContent = text;
        this.#statusEl.classList.remove("is-ok", "is-error");
        if (tone === "ok") this.#statusEl.classList.add("is-ok");
        if (tone === "error") this.#statusEl.classList.add("is-error");
        if (!text) {
            this.#statusEl.classList.add("is-hidden");
            return;
        }
        this.#statusEl.classList.remove("is-hidden");
    }

    /**
     * Toggles loading UI state.
     *
     * @param {boolean} isLoading
     * @returns {void}
     */
    #setLoading(isLoading) {
        if (!this.#root) return;
        this.#root.classList.toggle("is-loading", isLoading);
    }

    /**
     * Resets all runtime state so a fresh connection can be established.
     *
     * @returns {void}
     */
    #resetState() {
        this.#client = null;
        this.#roomId = null;
        this.#threadRootEventId = null;
        this.#isConnected = false;
        this.#historyLoaded = false;
        this.#pendingEvents = [];
        this.#members = new Map();
        this.#commentEventMap = new Map();
        this.#reactionEventMap = new Map();
        this.#ownReactionByTargetAndKey = new Map();
        this.#reactionChipMap = new Map();
        this.#reactionBtnMap = new Map();
        this.#seenEvents = new Set();
        this.#hasAutoReconnected = false;
        this.#renderShell();
    }

    /**
     * Opens Matrix session and joins the configured comments room.
     *
     * @returns {Promise<void>}
     */
    async #connect() {
        this.#setLoading(true);
        this.#setStatus("Connecting to Matrix...");
        this.#setComposerState(true);

        try {
            this.#client = new MxjsClient({ homeserver: this.#homeserver });

            const restored = await this.#restoreSession();
            if (!restored) {
                this.#setStatus("Setting up...");
                await this.#registerAccount();
                await this.#ensureDisplayName();
            }

            const join = await this.#joinCommentsRoom();
            if (!join?.roomId) throw new Error("Failed to join comments room");

            this.#roomId = join.roomId;
            await this.#ensureDisplayName();
            await this.#loadMembers();
            await this.#ensureThreadRoot();
            this.#bindEvents();
            await this.#client.startSync(30000);
            this.#isConnected = true;

            await this.#loadThreadHistory();
            await this.#loadHistoricalReactions();
            this.#setStatus("");
            this.#setComposerState(false);
            this.#renderIdentity();

            if (this.#listEl && this.#listEl.children.length === 0) {
                this.#appendSystemRow("No comments yet. Be the first.");
            }
        } catch (error) {
            console.error("[BlogComments] Connection failed:", error);
            localStorage.removeItem(this.#sessionKey());
            this.#setStatus(`Connection failed: ${error.message}`, "error");
            this.#setComposerState(true);
        } finally {
            this.#setLoading(false);
        }
    }

    /**
     * Joins the configured room alias, with a federated fallback path.
     *
     * @returns {Promise<{ roomId: string } | null>}
     */
    async #joinCommentsRoom() {
        if (!this.#client) return null;

        const directJoin = await this.#client.joinRoom(this.#roomAlias);
        if (directJoin?.roomId) return directJoin;

        const resolved = await this.#client.resolveRoomAlias(this.#roomAlias);
        if (!resolved) return null;

        if (typeof this.#client.joinRoomById !== "function") return null;

        const aliasServer = this.#extractAliasServer(this.#roomAlias);
        const via = aliasServer ? [aliasServer] : undefined;
        const byId = await this.#client.joinRoomById(resolved, via ? { via } : {});
        if (byId?.roomId) return byId;

        return null;
    }

    /**
     * Restores saved Matrix auth from localStorage and validates the token is still accepted.
     *
     * @returns {Promise<boolean>}
     */
    async #restoreSession() {
        const raw = localStorage.getItem(this.#sessionKey());
        if (!raw || !this.#client) return false;

        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.accessToken || !parsed?.userId) return false;

            this.#client.accessToken = parsed.accessToken;
            this.#client.userId = parsed.userId;

            const valid = await this.#validateToken(parsed.accessToken);
            if (!valid) {
                if (parsed.username && parsed.password) {
                    console.warn("[BlogComments] Token expired — re-logging in");
                    const login = await this.#client.login(parsed.username, parsed.password);
                    if (login?.accessToken) {
                        localStorage.setItem(this.#sessionKey(), JSON.stringify({
                            ...parsed,
                            accessToken: login.accessToken
                        }));
                        return true;
                    }
                }
                console.warn("[BlogComments] Session invalid and no credentials to re-login — re-registering");
                localStorage.removeItem(this.#sessionKey());
                this.#client.accessToken = null;
                this.#client.userId = null;
                return false;
            }

            return true;
        } catch (error) {
            console.warn("[BlogComments] Failed to restore session", error);
            localStorage.removeItem(this.#sessionKey());
            return false;
        }
    }

    /**
     * Registers a new Matrix account with a UUID username and password.
     *
     * @returns {Promise<void>}
     */
    async #registerAccount() {
        if (!this.#client) return;

        const username = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
        const password = crypto.randomUUID();

        const result = await this.#client.register(username, password);
        if (!result?.accessToken || !result?.userId) {
            throw new Error("Account registration failed");
        }

        localStorage.setItem(this.#sessionKey(), JSON.stringify({
            accessToken: result.accessToken,
            userId: result.userId,
            username,
            password
        }));
    }

    /**
     * Checks whether an access token is still accepted by the homeserver.
     *
     * @param {string} accessToken
     * @returns {Promise<boolean>}
     */
    async #validateToken(accessToken) {
        try {
            const response = await fetch(
                `${this.#homeserver}/_matrix/client/v3/account/whoami`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Ensures the active guest account has a display name, restoring a saved
     * custom name or generating a fresh random one if none exists.
     *
     * @returns {Promise<void>}
     */
    async #ensureDisplayName() {
        if (!this.#client) return;

        const saved = localStorage.getItem(this.#customNameKey());
        const displayName = saved || await BlogComments.#generateRandomName();
        if (!saved) localStorage.setItem(this.#customNameKey(), displayName);

        this.#displayName = displayName;
        await this.#client.setDisplayName(displayName);

        if (this.#client.userId) {
            this.#members.set(this.#client.userId, { name: displayName });
        }
    }

    /**
     * Loads random name parts from shared data.
     *
     * @returns {Promise<void>}
     */
    static async #loadNameParts() {
        if (this.#nameParts) return;
        if (this.#namePartsPromise) return this.#namePartsPromise;

        this.#namePartsPromise = (async () => {
            try {
                const response = await fetch("/data/nameParts.json");
                const data = await response.json();
                this.#nameParts = {
                    firstParts: Array.isArray(data?.firstParts) ? data.firstParts : ["Guest"],
                    secondParts: Array.isArray(data?.secondParts) ? data.secondParts : ["User"]
                };
            } catch (error) {
                console.warn("[BlogComments] Failed to load name parts", error);
                this.#nameParts = {
                    firstParts: ["Guest"],
                    secondParts: ["User"]
                };
            }
        })();

        return this.#namePartsPromise;
    }

    /**
     * Generates a random display name matching existing chat naming style.
     *
     * @returns {Promise<string>}
     */
    static async #generateRandomName() {
        await this.#loadNameParts();

        const firstParts = this.#nameParts?.firstParts || ["Guest"];
        const secondParts = this.#nameParts?.secondParts || ["User"];
        const first = firstParts[Math.floor(Math.random() * firstParts.length)] || "Guest";
        const second = secondParts[Math.floor(Math.random() * secondParts.length)] || "User";
        return `${first}${second}`;
    }

    /**
     * Loads joined members for better display names.
     *
     * @returns {Promise<void>}
     */
    async #loadMembers() {
        if (!this.#client || !this.#roomId) return;

        try {
            const url = `${this.#homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(this.#roomId)}/members`;
            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${this.#client.accessToken}` }
            });

            if (!response.ok) {
                console.warn("[BlogComments] Failed to load members, status", response.status);
                return;
            }

            const data = await response.json();
            const events = Array.isArray(data?.chunk) ? data.chunk : [];

            for (const event of events) {
                if (event.type !== "m.room.member" || event.content?.membership !== "join") continue;
                const userId = event.state_key;
                if (!userId) continue;
                this.#members.set(userId, {
                    name: event.content?.displayname || this.#extractLocalpart(userId)
                });
            }

            console.log("[BlogComments] members map after load", [...this.#members.entries()]);
        } catch (error) {
            console.warn("[BlogComments] Failed to load members", error);
        }
    }

    /**
     * Subscribes to Matrix timeline events.
     *
     * @returns {void}
     */
    #bindEvents() {
        if (!this.#client || !this.#roomId) return;

        this.#client.on(ClientEvents.MessageCreate, ({ roomId, event }) => {
            if (roomId !== this.#roomId || !event?.event_id) return;
            if (!this.#historyLoaded) {
                this.#pendingEvents.push(event);
                return;
            }
            this.#handleIncomingEvent(event);
        });

        this.#client.on(ClientEvents.MemberUpdate, ({ roomId, change }) => {
            if (roomId !== this.#roomId || !change?.userId) return;

            if (change.type === "join" || change.type === "rename") {
                this.#members.set(change.userId, {
                    name: change.displayName || this.#extractLocalpart(change.userId)
                });
                return;
            }

            if (change.type === "leave" || change.type === "kick" || change.type === "ban") {
                this.#members.delete(change.userId);
            }
        });

        this.#client.on(ClientEvents.MessageDelete, ({ roomId, redacts }) => {
            if (roomId !== this.#roomId || !redacts) return;
            this.#handleMessageDelete(redacts);
        });

        this.#client.on(ClientEvents.ReactionAdd, ({ roomId, reacts, key, event }) => {
            if (roomId !== this.#roomId || !reacts || !key || !event?.event_id) return;
            if (this.#seenEvents.has(event.event_id)) return;
            this.#seenEvents.add(event.event_id);
            this.#applyReaction(reacts, key, event.sender || "", event.event_id);
        });

        this.#client.on(ClientEvents.ReactionRemove, ({ roomId, reacts, key, event }) => {
            if (roomId !== this.#roomId || !reacts || !key || !event?.redacts) return;
            this.#removeReaction(reacts, key, event.redacts);
        });
    }

    /**
     * Ensures there is exactly one root event for this post thread.
     *
     * @returns {Promise<void>}
     */
    async #ensureThreadRoot() {
        if (!this.#client || !this.#roomId) return;

        try {
            const history = await this.#client.getMessages(this.#roomId, { limit: 250 });
            const events = Array.isArray(history?.messages) ? history.messages : [];
            const threadRoot = events.find((event) => this.#isThreadRootEvent(event));

            if (threadRoot?.event_id) {
                this.#threadRootEventId = threadRoot.event_id;
                return;
            }

            const sent = await this.#client.sendMessage(this.#roomId, this.#threadRootBody());
            if (!sent?.eventId) {
                throw new Error("Failed to create thread root");
            }

            this.#threadRootEventId = sent.eventId;
        } catch (error) {
            console.warn("[BlogComments] Failed to ensure thread root", error);
            throw error;
        }
    }

    /**
     * Loads thread replies and hydrates comments. Reactions are loaded separately.
     *
     * @returns {Promise<void>}
     */
    async #loadThreadHistory() {
        if (!this.#client || !this.#roomId || !this.#threadRootEventId) return;

        try {
            const thread = await this.#client.getThreadEvents(this.#roomId, this.#threadRootEventId, { limit: 100 });
            const historyEvents = Array.isArray(thread?.events) ? thread.events : [];

            const allEvents = [...historyEvents, ...this.#pendingEvents];
            this.#pendingEvents = [];
            this.#historyLoaded = true;

            allEvents.sort((a, b) => (a.origin_server_ts || 0) - (b.origin_server_ts || 0));

            for (const event of allEvents) {
                this.#handleIncomingEvent(event);
            }
        } catch (error) {
            console.warn("[BlogComments] Failed to load thread history", error);
            this.#historyLoaded = true;
        }
    }

    /**
     * Loads historical reactions on the thread root event.
     *
     * @returns {Promise<void>}
     */
    async #loadHistoricalReactions() {
        if (!this.#client || !this.#roomId || !this.#threadRootEventId) return;

        try {
            const result = await this.#client.getEventRelationsByType(
                this.#roomId,
                this.#threadRootEventId,
                "m.annotation",
                { limit: 200 }
            );
            const events = Array.isArray(result?.events) ? result.events : [];
            for (const event of events) {
                if (!event?.event_id || this.#seenEvents.has(event.event_id)) continue;
                this.#seenEvents.add(event.event_id);
                const relation = event.content?.["m.relates_to"];
                if (relation?.event_id && relation?.key) {
                    this.#applyReaction(relation.event_id, relation.key, event.sender || "", event.event_id);
                }
            }
        } catch (error) {
            console.warn("[BlogComments] Failed to load historical reactions", error);
        }
    }

    /**
     * Routes timeline events to comment or reaction handlers.
     *
     * @param {Record<string, any>} event
     * @returns {void}
     */
    #handleIncomingEvent(event) {
        if (!event?.event_id || this.#seenEvents.has(event.event_id)) return;
        this.#seenEvents.add(event.event_id);

        if (event.type === "m.room.message") {
            if (event.content?.["m.relates_to"]?.rel_type === "m.replace") {
                this.#handleEditEvent(event);
                return;
            }
            if (this.#isThreadRootEvent(event) && !this.#threadRootEventId) {
                this.#threadRootEventId = event.event_id;
            }
            this.#handleMessageEvent(event);
            return;
        }

        if (event.type === "m.reaction") {
            const relation = event.content?.["m.relates_to"];
            const targetEventId = relation?.event_id;
            const key = relation?.key;
            if (!targetEventId || !key) return;
            this.#applyReaction(targetEventId, key, event.sender || "", event.event_id);
        }
    }

    /**
     * Processes message events and renders post-scoped comments.
     *
     * @param {Record<string, any>} event
     * @returns {void}
     */
    #handleMessageEvent(event) {
        const body = event.content?.body;
        const isReply = this.#isThreadReplyEvent(event);
        if (typeof body !== "string" || !isReply) return;

        const commentText = body.trim();
        if (!commentText) return;

        if (!this.#listEl) return;
        const known = this.#commentEventMap.get(event.event_id);
        if (known) return;

        this.#removeSystemRows();

        const itemEl = document.createElement("article");
        itemEl.className = "blog-comment-item";
        itemEl.dataset.eventId = event.event_id;

        const headerEl = document.createElement("header");
        headerEl.className = "blog-comment-head";

        const senderEl = document.createElement("strong");
        senderEl.className = "blog-comment-author";
        senderEl.textContent = this.#displayNameFor(event.sender || "");

        const handleEl = document.createElement("span");
        handleEl.className = "blog-comment-handle";
        handleEl.textContent = event.sender || "";

        const authorEl = document.createElement("div");
        authorEl.className = "blog-comment-author-group";
        if (event.sender === "@lit:ruv.wtf") {
            const badge = document.createElement("img");
            badge.src = "/logos/16px.png";
            badge.alt = "";
            badge.className = "blog-comment-owner-badge";
            authorEl.appendChild(badge);
        }
        authorEl.append(senderEl, handleEl);

        const timeEl = document.createElement("time");
        timeEl.className = "blog-comment-time";
        timeEl.dateTime = new Date(event.origin_server_ts || Date.now()).toISOString();
        timeEl.textContent = this.#formatTime(event.origin_server_ts || Date.now());

        headerEl.append(authorEl, timeEl);

        const bodyEl = document.createElement("p");
        bodyEl.className = "blog-comment-body";
        bodyEl.textContent = commentText;

        const isOwn = event.sender === this.#client?.userId;
        itemEl.append(headerEl, bodyEl);

        if (isOwn) {
            const actionsEl = document.createElement("footer");
            actionsEl.className = "blog-comment-actions";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "blog-comment-action-btn";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => this.#startEditComment(event.event_id));

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "blog-comment-action-btn is-danger";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => this.#deleteComment(event.event_id));

            actionsEl.append(editBtn, deleteBtn);
            itemEl.appendChild(actionsEl);
        }

        this.#listEl.appendChild(itemEl);

        this.#commentEventMap.set(event.event_id, {
            itemEl,
            senderEl,
            bodyEl,
            body: commentText,
            sender: event.sender || ""
        });
    }

    /**
     * Updates a rendered comment body when an m.replace edit event arrives.
     *
     * @param {Record<string, any>} event
     * @returns {void}
     */
    #handleEditEvent(event) {
        const targetId = event.content?.["m.relates_to"]?.event_id;
        const newBody = event.content?.["m.new_content"]?.body;
        if (!targetId || typeof newBody !== "string") return;
        const entry = this.#commentEventMap.get(targetId);
        if (!entry) return;
        const trimmed = newBody.trim();
        entry.body = trimmed;
        entry.bodyEl.textContent = trimmed;
    }

    /**
     * Switches a comment into inline-edit mode.
     *
     * @param {string} eventId
     * @returns {void}
     */
    #startEditComment(eventId) {
        const entry = this.#commentEventMap.get(eventId);
        if (!entry) return;

        const { bodyEl } = entry;
        const originalText = entry.body;

        bodyEl.style.display = "none";

        const editArea = document.createElement("div");
        editArea.className = "blog-comment-edit-area";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "blog-comment-edit-input";
        input.value = originalText;
        input.maxLength = 1000;

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "blog-comment-action-btn";
        saveBtn.textContent = "Save";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "blog-comment-action-btn";
        cancelBtn.textContent = "Cancel";

        const cancel = () => {
            editArea.remove();
            bodyEl.style.display = "";
        };

        const save = async () => {
            const newText = input.value.trim();
            if (!newText || newText === originalText) { cancel(); return; }
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            input.disabled = true;
            await this.#saveEditComment(eventId, newText);
            entry.body = newText;
            entry.bodyEl.textContent = newText;
            editArea.remove();
            bodyEl.style.display = "";
        };

        saveBtn.addEventListener("click", save);
        cancelBtn.addEventListener("click", cancel);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") cancel();
        });

        editArea.append(input, saveBtn, cancelBtn);
        bodyEl.insertAdjacentElement("afterend", editArea);
        input.focus();
        input.select();
    }

    /**
     * Sends an m.replace edit event for an existing comment.
     *
     * @param {string} eventId
     * @param {string} newText
     * @returns {Promise<void>}
     */
    async #saveEditComment(eventId, newText) {
        if (!this.#client || !this.#roomId) return;
        const txnId = Date.now();
        const url = `${this.#homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(this.#roomId)}/send/m.room.message/${txnId}`;
        try {
            await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${this.#client.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    msgtype: "m.text",
                    body: `* ${newText}`,
                    "m.new_content": { msgtype: "m.text", body: newText },
                    "m.relates_to": { rel_type: "m.replace", event_id: eventId }
                })
            });
        } catch (error) {
            console.warn("[BlogComments] Failed to send edit", error);
        }
    }

    /**
     * Redacts a comment event, removing it from the room timeline.
     *
     * @param {string} eventId
     * @returns {Promise<void>}
     */
    async #deleteComment(eventId) {
        if (!this.#client || !this.#roomId) return;
        const txnId = Date.now();
        const url = `${this.#homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(this.#roomId)}/redact/${encodeURIComponent(eventId)}/${txnId}`;
        try {
            await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${this.#client.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: "{}"
            });
        } catch (error) {
            console.warn("[BlogComments] Failed to delete comment", error);
        }
    }

    /**
     * Adds or removes the current user's reaction for a target message.
     *
     * @param {string} targetEventId
     * @param {string} key
     * @returns {Promise<void>}
     */
    async #togglePostReaction(key) {
        if (!this.#client || !this.#roomId || !this.#threadRootEventId || !this.#isConnected) return;

        const ownKey = `${this.#threadRootEventId}|${key}`;
        const ownReactionEventId = this.#ownReactionByTargetAndKey.get(ownKey);

        try {
            if (ownReactionEventId) {
                await this.#client.removeReaction(this.#roomId, ownReactionEventId);
                return;
            }

            await this.#client.reactToMessage(this.#roomId, this.#threadRootEventId, key);
        } catch (error) {
            console.warn("[BlogComments] Failed to toggle post reaction", error);
        }
    }

    /**
     * Applies a reaction to a rendered comment.
     *
     * @param {string} targetEventId
     * @param {string} key
     * @param {string} sender
     * @param {string} reactionEventId
     * @returns {void}
     */
    #applyReaction(targetEventId, key, sender, reactionEventId) {
        if (!this.#threadRootEventId || targetEventId !== this.#threadRootEventId) return;

        this.#reactionEventMap.set(reactionEventId, { targetEventId, key, sender });

        if (sender && sender === this.#client?.userId) {
            this.#ownReactionByTargetAndKey.set(`${targetEventId}|${key}`, reactionEventId);
        }

        const btn = this.#reactionBtnMap.get(key);
        if (!btn) return;

        const countEl = btn.querySelector(".blog-reaction-btn-count");
        if (countEl) {
            const current = Number(countEl.textContent || "0");
            countEl.textContent = String(current + 1);
            countEl.classList.remove("is-hidden");
        }

        if (sender && sender === this.#client?.userId) btn.classList.add("is-own");
    }

    /**
     * Removes a reaction from a rendered comment.
     *
     * @param {string} targetEventId
     * @param {string} key
     * @param {string} reactionEventId
     * @returns {void}
     */
    #removeReaction(targetEventId, key, reactionEventId) {
        if (!this.#threadRootEventId || targetEventId !== this.#threadRootEventId) return;

        const reactionInfo = this.#reactionEventMap.get(reactionEventId);
        const wasOwn = reactionInfo?.sender === this.#client?.userId;
        if (wasOwn) {
            this.#ownReactionByTargetAndKey.delete(`${targetEventId}|${key}`);
        }
        this.#reactionEventMap.delete(reactionEventId);

        const btn = this.#reactionBtnMap.get(key);
        if (!btn) return;

        if (wasOwn) btn.classList.remove("is-own");

        const countEl = btn.querySelector(".blog-reaction-btn-count");
        if (countEl) {
            const count = Number(countEl.textContent || "0") - 1;
            if (count <= 0) {
                countEl.textContent = "";
                countEl.classList.add("is-hidden");
            } else {
                countEl.textContent = String(count);
            }
        }
    }

    /**
     * Removes a previously rendered comment when its message is redacted.
     *
     * @param {string} eventId
     * @returns {void}
     */
    #handleMessageDelete(eventId) {
        // If it's a tracked reaction, route to reaction removal.
        const reactionInfo = this.#reactionEventMap.get(eventId);
        if (reactionInfo) {
            this.#removeReaction(reactionInfo.targetEventId, reactionInfo.key, eventId);
            return;
        }

        const rendered = this.#commentEventMap.get(eventId);
        if (rendered?.itemEl) {
            rendered.itemEl.remove();
        }
        this.#commentEventMap.delete(eventId);

        if (!this.#listEl) return;
        if (this.#listEl.querySelector(".blog-comment-item")) return;

        this.#removeSystemRows();
        this.#appendSystemRow("No comments yet. Be the first.");
    }

    /**
     * Sends a new comment event.
     *
     * @returns {Promise<void>}
     */
    async #sendComment() {
        if (!this.#client || !this.#roomId || !this.#threadRootEventId || !this.#inputEl || !this.#sendBtn || !this.#isConnected) return;

        const text = this.#inputEl.value.trim();
        if (!text) return;

        this.#setComposerState(true);
        try {
            if (this.#displayName) {
                await this.#client.setDisplayName(this.#displayName);
            }

            let sent = null;

            if (typeof this.#client.sendThreadReply === "function") {
                sent = await this.#client.sendThreadReply(this.#roomId, this.#threadRootEventId, text);
            } else {
                sent = await this.#client.sendEvent(
                    this.#roomId,
                    "m.room.message",
                    {
                        msgtype: "m.text",
                        body: text,
                        "m.relates_to": {
                            rel_type: "m.thread",
                            event_id: this.#threadRootEventId,
                            is_falling_back: true,
                            "m.in_reply_to": { event_id: this.#threadRootEventId }
                        }
                    }
                );
            }

            if (!sent?.eventId) throw new Error("Failed to send comment");
            this.#inputEl.value = "";
            this.#hasAutoReconnected = false;
        } catch (error) {
            console.error("[BlogComments] Failed to send comment", error);

            if (!this.#hasAutoReconnected) {
                console.warn("[BlogComments] Send failed — attempting session recovery");
                this.#hasAutoReconnected = true;
                localStorage.removeItem(this.#sessionKey());
                this.#resetState();
                this.#setStatus("Session expired — reconnecting...");
                await this.#connect();
                return;
            }

            this.#appendSystemRow(`Failed to send comment: ${error.message}`, true);
        } finally {
            this.#setComposerState(false);
            this.#inputEl?.focus();
        }
    }

    /**
     * Enables or disables the composer controls.
     *
     * @param {boolean} disabled
     * @returns {void}
     */
    #setComposerState(disabled) {
        if (this.#inputEl) this.#inputEl.disabled = disabled;
        if (this.#sendBtn) this.#sendBtn.disabled = disabled;
    }

    /**
     * Displays a lightweight system row in the comments list.
     *
     * @param {string} text
     * @param {boolean} isError
     * @returns {void}
     */
    #appendSystemRow(text, isError = false) {
        if (!this.#listEl) return;

        const row = document.createElement("p");
        row.className = `blog-comments-system${isError ? " is-error" : ""}`;
        row.textContent = text;
        this.#listEl.appendChild(row);
    }

    /**
     * Removes previously rendered system rows.
     *
     * @returns {void}
     */
    #removeSystemRows() {
        if (!this.#listEl) return;
        this.#listEl.querySelectorAll(".blog-comments-system").forEach((row) => row.remove());
    }

    /**
     * Checks if an event is the dedicated root message for this post thread.
     *
     * @param {Record<string, any>} event
     * @returns {boolean}
     */
    #isThreadRootEvent(event) {
        return event?.type === "m.room.message" && event?.content?.body === this.#threadRootBody();
    }

    /**
     * Checks whether a room message belongs to the current post thread.
     *
     * @param {Record<string, any>} event
     * @returns {boolean}
     */
    #isThreadReplyEvent(event) {
        if (!this.#threadRootEventId || event?.type !== "m.room.message") return false;
        const relation = event?.content?.["m.relates_to"];
        return relation?.rel_type === "m.thread" && relation?.event_id === this.#threadRootEventId;
    }

    /**
     * Resolves a display name for a Matrix user id.
     *
     * @param {string} userId
     * @returns {string}
     */
    #displayNameFor(userId) {
        if (!userId) return "Unknown";
        return this.#members.get(userId)?.name || this.#extractLocalpart(userId);
    }

    /**
     * Extracts localpart from Matrix user id.
     *
     * @param {string} userId
     * @returns {string}
     */
    #extractLocalpart(userId) {
        const match = userId.match(/^@([^:]+):/);
        return match ? match[1] : userId;
    }

    /**
     * Extracts alias homeserver name from a room alias.
     *
     * @param {string} roomAlias
     * @returns {string | null}
     */
    #extractAliasServer(roomAlias) {
        const match = roomAlias.match(/^#[^:]+:(.+)$/);
        return match ? match[1] : null;
    }

    /**
     * Formats timestamps for comment headers.
     *
     * @param {number} timestamp
     * @returns {string}
     */
    #formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }
}
