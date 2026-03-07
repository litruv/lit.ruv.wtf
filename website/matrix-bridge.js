/**
 * Matrix Chat Bridge - Iframe communication layer for CSP-restricted hosts
 * Handles Matrix API calls via postMessage from parent window
 */

// Allow requests from these origins
const ALLOWED_ORIGINS = [
    'https://litruv.neocities.org',
    'https://lit.ruv.wtf',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080'
];

/**
 * Matrix API configuration
 */
const MATRIX_CONFIG = {
    homeserver: 'https://chat.ruv.wtf',
    publicReadToken: 'syt_Z2VuZXJhbGNoYXQtcmVhZG9ubHk_sikLltUtfbHlztnanEVm_2icJ1o'
};

/**
 * Make a Matrix API call
 * @param {string} endpoint - API endpoint path
 * @param {object} options - Fetch options
 * @param {string|null} accessToken - Optional access token
 * @returns {Promise<any>}
 */
async function matrixApiFetch(endpoint, options = {}, accessToken = null) {
    const url = `${MATRIX_CONFIG.homeserver}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            return { error: true, ...data };
        }

        return data;
    } catch (error) {
        return {
            error: true,
            errcode: 'M_NETWORK_ERROR',
            error: error.message
        };
    }
}

/**
 * Handle Matrix API requests from parent window
 */
window.addEventListener('message', async (event) => {
    // Verify origin
    if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn('[Matrix Bridge] Rejected message from unauthorized origin:', event.origin);
        return;
    }

    const { type, requestId, payload } = event.data;

    if (!type || !requestId) {
        return;
    }

    let result;

    try {
        switch (type) {
            case 'matrix:api':
                result = await handleApiRequest(payload);
                break;

            case 'matrix:auth':
                result = await handleAuth(payload);
                break;

            case 'matrix:sendMessage':
                result = await handleSendMessage(payload);
                break;

            case 'matrix:fetchPresence':
                result = await handleFetchPresence(payload);
                break;

            case 'matrix:fetchLastMessage':
                result = await handleFetchLastMessage(payload);
                break;

            case 'matrix:sync':
                result = await handleSync(payload);
                break;

            case 'matrix:resolveAlias':
                result = await handleResolveAlias(payload);
                break;

            default:
                result = {
                    error: true,
                    errcode: 'M_UNKNOWN_REQUEST',
                    error: `Unknown request type: ${type}`
                };
        }
    } catch (error) {
        result = {
            error: true,
            errcode: 'M_BRIDGE_ERROR',
            error: error.message
        };
    }

    // Send response back to parent
    event.source.postMessage({
        type: `${type}:response`,
        requestId,
        payload: result
    }, event.origin);
});

/**
 * Handle generic Matrix API request
 */
async function handleApiRequest({ endpoint, method = 'GET', body = null, accessToken = null }) {
    return await matrixApiFetch(
        `/_matrix/client/r0${endpoint}`,
        {
            method,
            body: body ? JSON.stringify(body) : undefined
        },
        accessToken
    );
}

/**
 * Handle authentication request
 */
async function handleAuth({ username, password }) {
    return await matrixApiFetch('/_matrix/client/r0/login', {
        method: 'POST',
        body: JSON.stringify({
            type: 'm.login.password',
            identifier: {
                type: 'm.id.user',
                user: username
            },
            password: password
        })
    });
}

/**
 * Handle send message request
 */
async function handleSendMessage({ roomId, content, accessToken, txnId }) {
    const msgtype = content.msgtype || 'm.text';
    const endpoint = `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`;

    return await matrixApiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(content)
    }, accessToken);
}

/**
 * Handle fetch presence request
 */
async function handleFetchPresence({ userId }) {
    return await matrixApiFetch(
        `/_matrix/client/r0/presence/${encodeURIComponent(userId)}/status`,
        { method: 'GET' },
        MATRIX_CONFIG.publicReadToken
    );
}

/**
 * Handle fetch last message request
 */
async function handleFetchLastMessage({ roomId }) {
    return await matrixApiFetch(
        `/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=1`,
        { method: 'GET' },
        MATRIX_CONFIG.publicReadToken
    );
}

/**
 * Handle sync request
 */
async function handleSync({ accessToken, since, timeout = 0 }) {
    let endpoint = `/_matrix/client/r0/sync?timeout=${timeout}`;
    if (since) {
        endpoint += `&since=${encodeURIComponent(since)}`;
    }

    return await matrixApiFetch(endpoint, {
        method: 'GET'
    }, accessToken);
}

/**
 * Handle room alias resolution
 */
async function handleResolveAlias({ roomAlias }) {
    return await matrixApiFetch(
        `/_matrix/client/r0/directory/room/${encodeURIComponent(roomAlias)}`,
        { method: 'GET' },
        MATRIX_CONFIG.publicReadToken
    );
}

// Notify parent that bridge is ready
window.addEventListener('load', () => {
    if (window.parent !== window) {
        window.parent.postMessage({
            type: 'matrix:bridge:ready'
        }, '*');
    }
    console.log('[Matrix Bridge] Ready and listening for requests');
});
