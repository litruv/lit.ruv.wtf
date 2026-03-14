/**
 * Number Match game command - A terminal-based number matching puzzle game
 * Match pairs of numbers that are equal or sum to 10
 */

/**
 * SAM (Software Automatic Mouth) speech synthesizer instance
 * Uses default SAM voice preset for classic C64 feel
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

/**
 * Play a click/select sound
 * @returns {void}
 */
function playClickSound() {
    if (window.terminalSounds) {
        const sounds = window.terminalSounds;
        sounds.play(sounds.pickRandom(sounds.files.typing), 0.25);
    }
}

/**
 * Play a match success sound
 * @returns {void}
 */
function playMatchSound() {
    if (window.terminalSounds) {
        const sounds = window.terminalSounds;
        sounds.play(sounds.pickRandom(sounds.files.enter), 0.3);
    }
}

/**
 * Play an error/invalid sound
 * @returns {void}
 */
function playErrorSound() {
    if (window.terminalSounds) {
        const sounds = window.terminalSounds;
        sounds.play(sounds.files.scroll, 0.2);
    }
}

/**
 * Shuffle an array in place using the Fisher-Yates algorithm.
 * @template T
 * @param {T[]} array - Array to shuffle
 * @returns {T[]} The shuffled array
 */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

/**
 * Core game state manager for Number Match logic.
 */
class NumberMatchGame {
    /**
     * @param {{ width?: number, rows?: number }} [options] - Configuration object
     */
    constructor(options = {}) {
        const { width = 9, rows = 4 } = options;
        this.width = width;
        this.initialRows = rows;
        this.reset();
    }

    /**
     * Regenerate the board with a fresh puzzle.
     * @returns {void}
     */
    reset() {
        const initialState = NumberMatchGame.generateInitialState(this.width, this.initialRows);
        this.tiles = initialState.boardTiles;
    }

    /**
     * Get a shallow copy of the current tiles.
     * @returns {(number|null)[]} Current tile values
     */
    getTiles() {
        return [...this.tiles];
    }

    /**
     * Count the remaining non-null tiles.
     * @returns {number} Number of tiles left on the board
     */
    getRemainingCount() {
        return this.tiles.filter((tile) => tile !== null).length;
    }

    /**
     * Determine whether the board has been cleared.
     * @returns {boolean} True when all tiles have been removed
     */
    isComplete() {
        return this.tiles.every((tile) => tile === null);
    }

    /**
     * Attempt to match and remove two indices.
     * @param {number} firstIndex - Index of the first tile
     * @param {number} secondIndex - Index of the second tile
     * @returns {boolean} True if the match succeeded
     */
    selectPair(firstIndex, secondIndex) {
        if (!this.canPair(firstIndex, secondIndex)) {
            return false;
        }

        this.tiles[firstIndex] = null;
        this.tiles[secondIndex] = null;
        this.compactEmptyRows();
        return true;
    }

    /**
     * Check whether the two indices can form a valid pair.
     * @param {number} firstIndex - Index of the first tile
     * @param {number} secondIndex - Index of the second tile
     * @returns {boolean} True if the tiles satisfy match rules and path constraints
     */
    canPair(firstIndex, secondIndex) {
        if (firstIndex === secondIndex) {
            return false;
        }

        if (!NumberMatchGame.isValidIndex(firstIndex, this.tiles) || 
            !NumberMatchGame.isValidIndex(secondIndex, this.tiles)) {
            return false;
        }

        const valueA = this.tiles[firstIndex];
        const valueB = this.tiles[secondIndex];

        if (valueA === null || valueB === null) {
            return false;
        }

        if (!(valueA === valueB || valueA + valueB === 10)) {
            return false;
        }

        return this.hasClearPath(firstIndex, secondIndex);
    }

    /**
     * Append remaining tiles in reading order.
     * @returns {boolean} True when tiles were appended
     */
    addNumbers() {
        this.compactEmptyRows();
        const remaining = this.tiles.filter((tile) => tile !== null);
        if (remaining.length === 0) {
            return false;
        }

        this.trimTrailingEmptySlots();
        this.tiles.push(...remaining);
        return true;
    }

    /**
     * Remove trailing null placeholders from the board.
     * @returns {void}
     */
    trimTrailingEmptySlots() {
        while (this.tiles.length > 0 && this.tiles[this.tiles.length - 1] === null) {
            this.tiles.pop();
        }
    }

    /**
     * Verify that a straight path between two indices is unobstructed.
     * @param {number} firstIndex - One tile index
     * @param {number} secondIndex - The other tile index
     * @returns {boolean} True if any allowed path between the indices is clear
     */
    hasClearPath(firstIndex, secondIndex) {
        const start = Math.min(firstIndex, secondIndex);
        const end = Math.max(firstIndex, secondIndex);

        const rowStart = Math.floor(start / this.width);
        const rowEnd = Math.floor(end / this.width);
        const colStart = start % this.width;
        const colEnd = end % this.width;

        // Horizontal (same row, adjacent or with empty cells between)
        if (rowStart === rowEnd && this.isSegmentClear(start, end, 1)) {
            return true;
        }

        // Vertical (same column)
        const diff = end - start;
        if (colStart === colEnd && diff % this.width === 0 && this.isSegmentClear(start, end, this.width)) {
            return true;
        }

        // Diagonal down-right (row increases, col increases)
        const rowDelta = rowEnd - rowStart;
        const colDelta = colEnd - colStart;
        
        if (rowDelta === colDelta && rowDelta > 0) {
            // Down-right diagonal: step = width + 1
            if (this.isSegmentClear(start, end, this.width + 1)) {
                return true;
            }
        }

        // Diagonal down-left (row increases, col decreases)
        if (rowDelta === -colDelta && rowDelta > 0) {
            // Down-left diagonal: step = width - 1
            if (this.isSegmentClear(start, end, this.width - 1)) {
                return true;
            }
        }

        // Wrap-around horizontal (end of one row to start of next)
        if (rowEnd === rowStart + 1 && colStart === this.width - 1 && colEnd === 0) {
            // Adjacent via wrap
            return true;
        }
        if (diff === 1 || diff === this.width) {
            // Directly adjacent
            return true;
        }

        return false;
    }

    /**
     * Remove any fully empty rows from the board to keep the grid compact.
     * @returns {void}
     */
    compactEmptyRows() {
        let index = 0;
        while (index < this.tiles.length) {
            const remaining = this.tiles.length - index;
            const span = Math.min(this.width, remaining);
            const slice = this.tiles.slice(index, index + span);
            const isEmptyRow = slice.every((value) => value === null);
            if (isEmptyRow) {
                this.tiles.splice(index, span);
                continue;
            }
            index += this.width;
        }
    }

    /**
     * Verify that the indices along a stepped path are empty.
     * @param {number} start - Starting index (inclusive)
     * @param {number} end - Ending index (inclusive)
     * @param {number} step - Increment applied each iteration
     * @returns {boolean} True if no non-null tiles exist between start and end
     */
    isSegmentClear(start, end, step) {
        for (let current = start + step; current < end; current += step) {
            if (this.tiles[current] !== null) {
                return false;
            }
        }
        return true;
    }

    /**
     * Find a valid pair hint.
     * @returns {[number, number]|null} A pair of indices or null if none available
     */
    findHint() {
        const tiles = this.tiles;
        for (let i = 0; i < tiles.length; i++) {
            if (tiles[i] === null) continue;
            for (let j = i + 1; j < tiles.length; j++) {
                if (tiles[j] === null) continue;
                if (this.canPair(i, j)) {
                    return [i, j];
                }
            }
        }
        return null;
    }

    /**
     * Determine whether the provided index is valid for the current tile array.
     * @param {number} index - Index to evaluate
     * @param {(number|null)[]} tiles - Tile array
     * @returns {boolean} True when the index is within bounds
     */
    static isValidIndex(index, tiles) {
        return index >= 0 && index < tiles.length;
    }

    /**
     * Create a randomized board configuration.
     * @param {number} width - Number of columns
     * @param {number} rows - Number of initial rows
     * @returns {{ boardTiles: number[] }} Generated tile set
     */
    static generateInitialState(width, rows) {
        const boardCapacity = width * rows;
        const maxBoardMatches = Math.min(6, Math.floor(boardCapacity / 2));
        const forcedPairs = NumberMatchGame.getForcedPairs(maxBoardMatches);
        const forcedAssignments = new Map();

        const horizontalStarts = [];
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
            for (let colIndex = 0; colIndex < width - 1; colIndex += 1) {
                horizontalStarts.push(rowIndex * width + colIndex);
            }
        }

        const shuffledStarts = shuffle(horizontalStarts);
        const reserved = new Set();
        let startCursor = 0;

        forcedPairs.forEach((pair) => {
            let startIndex = null;
            while (startCursor < shuffledStarts.length) {
                const candidate = shuffledStarts[startCursor];
                startCursor += 1;
                if (reserved.has(candidate) || reserved.has(candidate + 1)) {
                    continue;
                }
                startIndex = candidate;
                break;
            }

            if (startIndex === null) {
                return;
            }

            forcedAssignments.set(startIndex, pair[0]);
            forcedAssignments.set(startIndex + 1, pair[1]);
            reserved.add(startIndex);
            reserved.add(startIndex + 1);
        });

        const boardTiles = new Array(boardCapacity).fill(null);

        for (let index = 0; index < boardCapacity; index += 1) {
            const forcedValue = forcedAssignments.get(index);
            if (typeof forcedValue === 'number') {
                boardTiles[index] = forcedValue;
                continue;
            }

            const rawNextForced = forcedAssignments.get(index + 1);
            const nextForcedValue = typeof rawNextForced === 'number' ? rawNextForced : null;
            boardTiles[index] = NumberMatchGame.pickSafeFillerValue(boardTiles, width, index, nextForcedValue);
        }

        return { boardTiles };
    }

    /**
     * Produce a random pair of values that form a legal match.
     * @returns {[number, number]} Two values that either match or sum to ten
     */
    static generatePair() {
        const complementPairs = [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]];
        const identicalValues = [1, 2, 3, 4, 5, 6, 7, 8, 9];

        if (Math.random() < 0.5) {
            const value = identicalValues[Math.floor(Math.random() * identicalValues.length)];
            return [value, value];
        }

        const pair = complementPairs[Math.floor(Math.random() * complementPairs.length)];
        return [...pair];
    }

    /**
     * Create the predetermined matches that appear on the initial board.
     * @param {number} target - Total matches to prepare
     * @returns {Array<[number, number]>} Ordered list of forced pairs
     */
    static getForcedPairs(target) {
        const essentialPairs = [[5, 5]];
        const complementPool = shuffle([
            [1, 9], [2, 8], [3, 7], [4, 6],
            [9, 1], [8, 2], [7, 3], [6, 4]
        ]);
        const pairs = [];

        for (let i = 0; i < essentialPairs.length && pairs.length < target; i += 1) {
            pairs.push(essentialPairs[i]);
        }

        let complementIndex = 0;
        while (pairs.length < target && complementIndex < complementPool.length) {
            pairs.push(complementPool[complementIndex]);
            complementIndex += 1;
        }

        while (pairs.length < target) {
            pairs.push(NumberMatchGame.generatePair());
        }

        return shuffle(pairs);
    }

    /**
     * Pick a filler value that will not immediately create an accessible match.
     * @param {Array<number|null>} tiles - Current partially filled board
     * @param {number} width - Board width
     * @param {number} index - Index to populate
     * @param {number|null} nextForcedValue - Upcoming forced value, if one exists
     * @returns {number} Safe filler digit
     */
    static pickSafeFillerValue(tiles, width, index, nextForcedValue) {
        const attempt = (respectNext) => {
            const forbidden = NumberMatchGame.collectForbiddenValues(tiles, width, index, respectNext ? nextForcedValue : null);
            const candidates = [];
            for (let value = 1; value <= 9; value += 1) {
                if (!forbidden.has(value)) {
                    candidates.push(value);
                }
            }
            return candidates;
        };

        let candidates = attempt(true);
        if (candidates.length === 0) {
            candidates = attempt(false);
        }

        if (candidates.length === 0) {
            return Math.floor(Math.random() * 9) + 1;
        }

        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * Collect forbidden values based on already placed neighbors.
     * @param {Array<number|null>} tiles - Current board state
     * @param {number} width - Board width
     * @param {number} index - Target index
     * @param {number|null} nextForcedValue - Forced value to appear next in sequence, if any
     * @returns {Set<number>} Values that should not be used at the index
     */
    static collectForbiddenValues(tiles, width, index, nextForcedValue) {
        const forbidden = new Set();
        const register = NumberMatchGame.registerForbiddenValue;

        if (index > 0) {
            register(forbidden, tiles[index - 1]);
        }

        const row = Math.floor(index / width);
        const col = index % width;

        if (row > 0) {
            register(forbidden, tiles[index - width]);
            if (col > 0) {
                register(forbidden, tiles[index - width - 1]);
            }
            if (col < width - 1) {
                register(forbidden, tiles[index - width + 1]);
            }
        }

        if (typeof nextForcedValue === 'number') {
            register(forbidden, nextForcedValue);
        }

        return forbidden;
    }

    /**
     * Register a value and its complement as forbidden for immediate placement.
     * @param {Set<number>} forbidden - Collection of disallowed values
     * @param {number|null|undefined} value - Value to mark as forbidden
     * @returns {void}
     */
    static registerForbiddenValue(forbidden, value) {
        if (typeof value !== 'number') {
            return;
        }

        forbidden.add(value);
        const complement = NumberMatchGame.getComplement(value);
        forbidden.add(complement);
    }

    /**
     * Compute the complement digit that forms a sum-to-ten relationship.
     * @param {number} value - Value between 1 and 9
     * @returns {number} Complement digit
     */
    static getComplement(value) {
        if (value === 5) {
            return 5;
        }
        const complement = 10 - value;
        return Math.min(9, Math.max(1, complement));
    }
}

/**
 * Game mode state for terminal integration
 */
export const gameMode = {
    active: false,
    game: null,
    selectedIndex: null,
    matchesCleared: 0,
    term: null,
    boardLines: 0,
    message: ''
};

/**
 * Calculate how many lines the board display uses
 * @param {NumberMatchGame} game - Game instance
 * @returns {number} Number of lines to move up
 */
function getBoardLineCount(game) {
    const rows = Math.ceil(game.getTiles().length / game.width);
    // header + top border + rows + bottom border + empty + status + message
    // (prompt uses write not writeln, so doesn't add a line)
    return 1 + 1 + rows + 1 + 1 + 1 + 1;
}

/**
 * Render the game board as ASCII art (initial draw)
 * @param {Terminal} term - xterm.js terminal instance
 * @param {NumberMatchGame} game - Game instance
 * @param {number|null} selectedIndex - Currently selected tile index
 * @param {string} message - Status message to display
 * @returns {void}
 */
function renderBoard(term, game, selectedIndex, message = '') {
    const tiles = game.getTiles();
    const width = game.width;
    const rows = Math.ceil(tiles.length / width);

    // Column headers
    let header = '     ';
    for (let c = 0; c < width; c++) {
        header += ` ${c + 1} `;
    }
    term.writeln(`\x1b[90m${header}\x1b[0m`);
    
    // Top border
    term.writeln(`    ┌${'───'.repeat(width)}┐`);

    for (let row = 0; row < rows; row++) {
        let line = `  ${String.fromCharCode(65 + row)} │`;
        
        for (let col = 0; col < width; col++) {
            const idx = row * width + col;
            if (idx >= tiles.length) {
                line += '   ';
                continue;
            }
            
            const value = tiles[idx];
            if (value === null) {
                line += ' · ';
            } else if (idx === selectedIndex) {
                // Highlight selected tile
                line += `\x1b[7m ${value} \x1b[0m`;
            } else {
                line += ` ${value} `;
            }
        }
        
        line += '│';
        term.writeln(line);
    }

    // Bottom border
    term.writeln(`    └${'───'.repeat(width)}┘`);
    
    // Status line
    term.writeln('');
    const remaining = game.getRemainingCount();
    term.writeln(`  \x1b[33mMatches:\x1b[0m ${gameMode.matchesCleared}    \x1b[33mRemaining:\x1b[0m ${remaining}  `);
    
    // Message line (padded to clear previous)
    const msgText = message || '';
    term.writeln(`  ${msgText}`.padEnd(50));
    
    // Prompt
    term.write('\x1b[33mgame>\x1b[0m ');
    
    gameMode.boardLines = getBoardLineCount(game);
    gameMode.message = message;
}

/**
 * Update the board in place without scrolling
 * @param {Terminal} term - xterm.js terminal instance
 * @param {NumberMatchGame} game - Game instance
 * @param {number|null} selectedIndex - Currently selected tile index
 * @param {string} message - Status message to display
 * @returns {void}
 */
function updateBoardInPlace(term, game, selectedIndex, message = '') {
    const linesToMoveUp = gameMode.boardLines;
    
    // Move cursor up to start of board, go to column 0, clear to end of screen
    term.write(`\x1b[${linesToMoveUp}A\r\x1b[J`);
    
    // Redraw from current position
    renderBoard(term, game, selectedIndex, message);
}

/**
 * Display help text
 * @param {Terminal} term - xterm.js terminal instance
 * @returns {void}
 */
function renderHelp(term) {
    term.writeln('');
    term.writeln('  \x1b[36mCommands:\x1b[0m');
    term.writeln('    A1 B2    - Select two tiles (e.g., A1 A2 or B3 C3)');
    term.writeln('    add      - Duplicate remaining numbers to end');
    term.writeln('    hint     - Show a valid pair');
    term.writeln('    new      - Start a new game');
    term.writeln('    quit     - Exit the game');
    term.writeln('');
    term.writeln('  \x1b[36mRules:\x1b[0m Match numbers that are equal or sum to 10');
    term.writeln('        Pairs must be adjacent horizontally or vertically');
    term.writeln('        (with only empty spaces between them)');
}

/**
 * Parse coordinate input like "A1" to index
 * @param {string} coord - Coordinate string (e.g., "A1", "B3")
 * @param {number} width - Board width
 * @returns {number|null} Tile index or null if invalid
 */
function parseCoordinate(coord, width) {
    const match = coord.toUpperCase().match(/^([A-Z])(\d+)$/);
    if (!match) return null;
    
    const row = match[1].charCodeAt(0) - 65;
    const col = parseInt(match[2], 10) - 1;
    
    if (row < 0 || col < 0 || col >= width) return null;
    
    return row * width + col;
}

/**
 * Process game input
 * @param {Terminal} term - xterm.js terminal instance
 * @param {string} input - User input
 * @returns {boolean} True if game should continue
 */
export function processGameInput(term, input) {
    if (!gameMode.active || !gameMode.game) {
        return false;
    }

    const cmd = input.trim().toLowerCase();
    const game = gameMode.game;

    if (cmd === 'quit' || cmd === 'exit' || cmd === '/quit') {
        gameMode.active = false;
        gameMode.game = null;
        gameMode.selectedIndex = null;
        gameMode.matchesCleared = 0;
        gameMode.term = null;
        gameMode.boardLines = 0;
        term.writeln('  Game exited.\r\n');
        return false;
    }

    if (cmd === 'new' || cmd === 'reset') {
        game.reset();
        gameMode.selectedIndex = null;
        gameMode.matchesCleared = 0;
        term.writeln('');
        renderBoard(term, game, null, 'New game started!');
        return true;
    }

    if (cmd === 'add') {
        const added = game.addNumbers();
        term.writeln('');
        if (added) {
            renderBoard(term, game, gameMode.selectedIndex, 'Numbers duplicated to end');
        } else {
            renderBoard(term, game, gameMode.selectedIndex, '\x1b[31mNo numbers to add\x1b[0m');
        }
        return true;
    }

    if (cmd === 'hint') {
        const hint = game.findHint();
        if (hint) {
            const [i, j] = hint;
            const width = game.width;
            const coord1 = String.fromCharCode(65 + Math.floor(i / width)) + ((i % width) + 1);
            const coord2 = String.fromCharCode(65 + Math.floor(j / width)) + ((j % width) + 1);
            term.writeln(`  \x1b[33mHint:\x1b[0m Try ${coord1} ${coord2}`);
        } else {
            term.writeln('  \x1b[31mNo matches. Try "add"\x1b[0m');
        }
        term.write('\x1b[33mgame>\x1b[0m ');
        return true;
    }

    if (cmd === 'help' || cmd === '?') {
        renderHelp(term);
        term.write('\x1b[33mgame>\x1b[0m ');
        return true;
    }

    // Try to parse as coordinates
    const parts = input.trim().toUpperCase().split(/\s+/);
    
    if (parts.length === 2) {
        const idx1 = parseCoordinate(parts[0], game.width);
        const idx2 = parseCoordinate(parts[1], game.width);
        
        if (idx1 === null || idx2 === null) {
            term.writeln('  \x1b[31mInvalid coordinates. Use format: A1 B2\x1b[0m');
            term.write('\x1b[33mgame>\x1b[0m ');
            return true;
        }

        const tiles = game.getTiles();
        if (idx1 >= tiles.length || idx2 >= tiles.length) {
            term.writeln('  \x1b[31mCoordinates out of range.\x1b[0m');
            term.write('\x1b[33mgame>\x1b[0m ');
            return true;
        }

        if (tiles[idx1] === null || tiles[idx2] === null) {
            term.writeln('  \x1b[31mOne or both tiles are empty.\x1b[0m');
            term.write('\x1b[33mgame>\x1b[0m ');
            return true;
        }

        const v1 = tiles[idx1];
        const v2 = tiles[idx2];
        const matched = game.selectPair(idx1, idx2);
        
        term.writeln('');
        if (matched) {
            gameMode.matchesCleared++;
            samSpeak('match');
            
            if (game.isComplete()) {
                samSpeak('Condrat ulationz');
                term.writeln('  \x1b[32m╔════════════════════════════════════╗\x1b[0m');
                term.writeln('  \x1b[32m║     CONGRATULATIONS! YOU WON!      ║\x1b[0m');
                term.writeln('  \x1b[32m╚════════════════════════════════════╝\x1b[0m');
                term.writeln('');
                term.writeln(`  Total matches: ${gameMode.matchesCleared}`);
                term.writeln('  Type "new" for another game or "quit" to exit.');
                term.write('\x1b[33mgame>\x1b[0m ');
                gameMode.boardLines = 0;
                return true;
            }
            renderBoard(term, game, null, `\x1b[32mMatch! ${v1}+${v2}\x1b[0m`);
        } else {
            samSpeak('no');
            if (v1 !== v2 && v1 + v2 !== 10) {
                renderBoard(term, game, null, `\x1b[31m${v1} and ${v2} don't match\x1b[0m`);
            } else {
                renderBoard(term, game, null, `\x1b[31mNo clear path\x1b[0m`);
            }
        }
        return true;
    }

    if (parts.length === 1 && parts[0]) {
        const idx = parseCoordinate(parts[0], game.width);
        if (idx !== null) {
            term.writeln('  \x1b[33mEnter two coordinates (e.g., A1 A2)\x1b[0m');
            term.write('\x1b[33mgame>\x1b[0m ');
            return true;
        }
    }

    if (cmd) {
        term.writeln('  \x1b[31mUnknown command. Type "help"\x1b[0m');
    }
    term.write('\x1b[33mgame>\x1b[0m ');
    return true;
}

/**
 * Start a new number match game session
 * @param {Terminal} term - xterm.js terminal instance
 * @returns {void}
 */
export function startGame(term) {
    gameMode.active = true;
    gameMode.game = new NumberMatchGame({ width: 9, rows: 4 });
    gameMode.selectedIndex = null;
    gameMode.matchesCleared = 0;
    gameMode.term = term;
    gameMode.boardLines = 0;
    gameMode.message = '';

    term.writeln('');
    term.writeln('  ╔════════════════════════════════════╗');
    term.writeln('  ║          NUMBER MATCH              ║');
    term.writeln('  ╚════════════════════════════════════╝');
    term.writeln('');
    term.writeln('  Match pairs: equal numbers or sum to 10');
    term.writeln('  \x1b[90mClick tiles or type coordinates (e.g., A1 A2)\x1b[0m');
    term.writeln('  \x1b[90mCommands: add, hint, new, quit\x1b[0m');
    term.writeln('');

    samSpeak('Number Match');
    renderBoard(term, gameMode.game, null, '');
}

/**
 * Handle a tile click from the terminal link provider
 * @param {string} coord - Coordinate string (e.g., "A1", "B3")
 * @returns {void}
 */
export function handleTileClick(coord) {
    if (!gameMode.active || !gameMode.game || !gameMode.term) {
        return;
    }

    const term = gameMode.term;
    const game = gameMode.game;
    const clickedIndex = parseCoordinate(coord, game.width);

    if (clickedIndex === null) {
        return;
    }

    const tiles = game.getTiles();
    if (clickedIndex >= tiles.length || tiles[clickedIndex] === null) {
        return;
    }

    // If no tile selected, select this one
    if (gameMode.selectedIndex === null) {
        gameMode.selectedIndex = clickedIndex;
        playClickSound();
        samSpeak(String(tiles[clickedIndex]));
        updateBoardInPlace(term, game, clickedIndex, `\x1b[33mSelected ${coord}. Click another to match.\x1b[0m`);
        return;
    }

    // If same tile clicked, deselect
    if (gameMode.selectedIndex === clickedIndex) {
        gameMode.selectedIndex = null;
        playClickSound();
        updateBoardInPlace(term, game, null, '');
        return;
    }

    // Try to match the two tiles
    const firstIndex = gameMode.selectedIndex;
    const prevTiles = game.getTiles();
    const v1 = prevTiles[firstIndex];
    const v2 = prevTiles[clickedIndex];
    
    const matched = game.selectPair(firstIndex, clickedIndex);
    gameMode.selectedIndex = null;

    if (matched) {
        gameMode.matchesCleared++;
        playMatchSound();
        samSpeak('match');

        if (game.isComplete()) {
            // Game won - need to redraw fresh for victory screen
            playMatchSound();
            samSpeak('Condrat ulationz');
            term.write(`\x1b[${gameMode.boardLines}A`);
            for (let i = 0; i < gameMode.boardLines; i++) {
                term.writeln('\x1b[2K');
            }
            term.writeln('  \x1b[32m╔════════════════════════════════════╗\x1b[0m');
            term.writeln('  \x1b[32m║     CONGRATULATIONS! YOU WON!      ║\x1b[0m');
            term.writeln('  \x1b[32m╚════════════════════════════════════╝\x1b[0m');
            term.writeln('');
            term.writeln(`  Total matches: ${gameMode.matchesCleared}`);
            term.writeln('  Type "new" for another game or "quit" to exit.');
            term.write('\x1b[33mgame>\x1b[0m ');
            gameMode.boardLines = 0;
            return;
        }
        
        updateBoardInPlace(term, game, null, `\x1b[32mMatch! ${v1}+${v2}\x1b[0m`);
    } else {
        playErrorSound();
        samSpeak('no');
        if (v1 !== v2 && v1 + v2 !== 10) {
            updateBoardInPlace(term, game, null, `\x1b[31m${v1} and ${v2} don't match or sum to 10\x1b[0m`);
        } else {
            updateBoardInPlace(term, game, null, `\x1b[31mNo clear path between tiles\x1b[0m`);
        }
    }
}

/**
 * Number Match command export
 */
export default {
    description: 'Play the Number Match puzzle game',
    execute: (term, writeClickable, VERSION, args) => {
        startGame(term);
        return null;
    }
};
