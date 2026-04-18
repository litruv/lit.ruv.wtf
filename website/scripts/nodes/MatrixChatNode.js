/**
 * @file MatrixChatNode.js
 * @UCLASS(BlueprintType, Blueprintable)
 */

import { NodeBase } from './NodeBase.js';
import { NodeRegistry } from './NodeRegistry.js';
import { ChatNode } from '../ChatNode.js';
import { GlobalVariables } from '../GlobalVariables.js';

/**
 * @UCLASS(BlueprintType)
 * Renders a full Matrix chat UI inside the node body.
 * Instantiates a ChatNode and registers it as the "MatrixChat" global.
 */
export class MatrixChatNode extends NodeBase {
    /** @UCLASS(BlueprintType) */
    static NodeType = "chat";

    /**
     * @UFUNCTION(BlueprintPure)
     */
    static BlueprintPure_GetDefaultPins() {
        return {
            inputs: [
                { id: 'exec_in', name: '', direction: 'input', kind: 'exec' },
                { id: 'homeserver', name: 'Homeserver', direction: 'input', kind: 'string', defaultValue: 'https://matrix.org' },
                { id: 'room_id', name: 'Room ID', direction: 'input', kind: 'string', defaultValue: '' }
            ],
            outputs: [
                { id: 'exec_out', name: '', direction: 'output', kind: 'exec' }
            ]
        };
    }

    /**
     * @UFUNCTION(BlueprintNativeEvent)
     * @param {HTMLElement} article
     * @param {import('../GraphNode.js').GraphNode} graphNode
     * @param {import('./NodeRenderContext.js').NodeRenderContext} renderCtx
     */
    BlueprintNativeEvent_OnRender(article, graphNode, renderCtx) {
        const body = document.createElement("div");
        body.className = "node-body node-body--chat";

        const statusBar = document.createElement("div");
        statusBar.className = "chat-status-bar";

        const statusEl = document.createElement("span");
        statusEl.className = "chat-status chat-status-disconnected";
        statusEl.textContent = "Not connected";
        statusBar.appendChild(statusEl);

        const messagesContainer = document.createElement("div");
        messagesContainer.className = "chat-messages";

        const inputContainer = document.createElement("div");
        inputContainer.className = "chat-input-container";

        const messageInput = document.createElement("input");
        messageInput.type = "text";
        messageInput.className = "chat-input";
        messageInput.placeholder = "Type a message or /nick...";
        messageInput.addEventListener("focus", () => {
            // On mobile the virtual keyboard shrinks the viewport. Delay lets the
            // keyboard finish animating before we scroll the input into view.
            window.setTimeout(() => {
                messageInput.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 300);
        });
        inputContainer.appendChild(messageInput);

        body.appendChild(statusBar);
        body.appendChild(messagesContainer);
        body.appendChild(inputContainer);
        article.appendChild(body);

        const homeserverPin = graphNode.inputs.find(p => p.id === "homeserver");
        const roomPin       = graphNode.inputs.find(p => p.id === "room");
        const homeserver    = homeserverPin?.defaultValue || "https://matrix.org";
        const roomAlias     = roomPin?.defaultValue || "#general:matrix.org";

        const chatInstance = new ChatNode(homeserver, roomAlias);
        // Pass resolver function so chat can resolve name at connect time
        chatInstance.initialize(
            messagesContainer, 
            messageInput, 
            statusEl, 
            inputContainer, 
            homeserver, 
            roomAlias, 
            () => renderCtx.BlueprintPure_ResolveInputValue?.(graphNode.id, "guestName") || ""
        );

        renderCtx.BlueprintCallable_RegisterChatInstance(graphNode.id, chatInstance);
        GlobalVariables.set("MatrixChat", chatInstance);
    }
}

NodeRegistry.UCLASS_Register(MatrixChatNode);
