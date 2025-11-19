/**
 * Shuffle an array in place using the Fisher-Yates algorithm.
 * @template T
 * @param {T[]} array Array to shuffle.
 * @returns {T[]} The shuffled array.
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
   * @param {{ width?: number, rows?: number }} [options] Configuration object.
   */
  constructor(options = {}) {
    const { width = 9, rows = 6 } = options;
    this.width = width;
    this.initialRows = rows;
    const initialState = NumberMatchGame.generateInitialState(width, rows);
    this.tiles = initialState.boardTiles;
    this.reserveTiles = initialState.reserveTiles;
  }

  /**
   * Regenerate the board with a fresh puzzle.
   * @returns {void}
   */
  reset() {
    const initialState = NumberMatchGame.generateInitialState(this.width, this.initialRows);
    this.tiles = initialState.boardTiles;
    this.reserveTiles = initialState.reserveTiles;
  }

  /**
   * Get a shallow copy of the current tiles.
   * @returns {(number|null)[]} Current tile values.
   */
  getTiles() {
    return [...this.tiles];
  }

  /**
   * Count the remaining non-null tiles.
   * @returns {number} Number of tiles left on the board.
   */
  getRemainingCount() {
    const boardCount = this.tiles.filter((tile) => tile !== null).length;
    return boardCount;
  }

  /**
   * Determine whether the board has been cleared.
   * @returns {boolean} True when all tiles have been removed.
   */
  isComplete() {
    return this.tiles.every((tile) => tile === null);
  }

  /**
   * Attempt to match and remove two indices.
   * @param {number} firstIndex Index of the first tile.
   * @param {number} secondIndex Index of the second tile.
   * @returns {boolean} True if the match succeeded.
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
   * @param {number} firstIndex Index of the first tile.
   * @param {number} secondIndex Index of the second tile.
   * @returns {boolean} True if the tiles satisfy match rules and path constraints.
   */
  canPair(firstIndex, secondIndex) {
    if (firstIndex === secondIndex) {
      return false;
    }

    if (!NumberMatchGame.isValidIndex(firstIndex, this.tiles) || !NumberMatchGame.isValidIndex(secondIndex, this.tiles)) {
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
   * Append remaining numbers to the end of the grid, respecting Add Numbers behavior.
   * @returns {boolean} True when new numbers were appended.
   */
  addNumbers(usesRemaining = 1) {
    this.compactEmptyRows();
    return this.appendRemainingTiles();
  }

  /**
   * Collect active tiles in reading order.
   * @returns {number[]} Non-null tile values.
   */
  getActiveTiles() {
    return this.tiles.filter((tile) => tile !== null);
  }

  /**
   * Append remaining tiles in reading order after exhausting reserve uses.
   * @returns {boolean} True when tiles were appended.
   */
  appendRemainingTiles() {
    const remaining = this.getActiveTiles();
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
   * @param {number} firstIndex One tile index.
   * @param {number} secondIndex The other tile index.
   * @returns {boolean} True if any allowed path between the indices is clear.
   */
  hasClearPath(firstIndex, secondIndex) {
    const start = Math.min(firstIndex, secondIndex);
    const end = Math.max(firstIndex, secondIndex);

    const rowStart = Math.floor(start / this.width);
    const rowEnd = Math.floor(end / this.width);
    const colStart = start % this.width;
    const colEnd = end % this.width;

    if (rowStart === rowEnd && this.isSegmentClear(start, end, 1)) {
      return true;
    }

    const diff = end - start;
    if (colStart === colEnd && diff % this.width === 0 && this.isSegmentClear(start, end, this.width)) {
      return true;
    }

    const rowDelta = rowEnd - rowStart;
    const colDelta = colEnd - colStart;

    if (rowDelta === colDelta && rowDelta > 0) {
      if (colStart + rowDelta < this.width && this.isSegmentClear(start, end, this.width + 1)) {
        return true;
      }
    }

    if (rowDelta === -colDelta && rowDelta > 0) {
      if (colStart - rowDelta >= 0 && this.isSegmentClear(start, end, this.width - 1)) {
        return true;
      }
    }

    return this.isSegmentClear(start, end, 1);
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
   * @param {number} start Starting index (inclusive).
   * @param {number} end Ending index (inclusive).
   * @param {number} step Increment applied each iteration.
   * @returns {boolean} True if no non-null tiles exist between start and end.
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
   * Determine whether the provided index is valid for the current tile array.
   * @param {number} index Index to evaluate.
   * @param {(number|null)[]} tiles Tile array.
   * @returns {boolean} True when the index is within bounds.
   */
  static isValidIndex(index, tiles) {
    return index >= 0 && index < tiles.length;
  }

  /**
   * Create a randomized board configuration split between visible tiles and a reserve pile.
   * @param {number} width Number of columns.
   * @param {number} rows Number of initial rows.
   * @returns {{ boardTiles: number[], reserveTiles: number[] }} Generated tile sets.
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
      if (typeof forcedValue === "number") {
        boardTiles[index] = forcedValue;
        continue;
      }

      const rawNextForced = forcedAssignments.get(index + 1);
      const nextForcedValue = typeof rawNextForced === "number" ? rawNextForced : null;

      boardTiles[index] = NumberMatchGame.pickSafeFillerValue(boardTiles, width, index, nextForcedValue);
    }

    const reserveTiles = NumberMatchGame.buildReserveTiles(boardTiles, boardCapacity);

    return {
      boardTiles,
      reserveTiles
    };
  }

  /**
   * Produce a random pair of values that form a legal match.
   * @returns {[number, number]} Two values that either match or sum to ten.
   */
  static generatePair() {
    const complementPairs = [
      [1, 9],
      [2, 8],
      [3, 7],
      [4, 6],
      [5, 5]
    ];
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
   * @param {number} target Total matches to prepare.
   * @returns {Array<[number, number]>} Ordered list of forced pairs.
   */
  static getForcedPairs(target) {
    const essentialPairs = [[5, 5]];
    const complementPool = shuffle([
      [1, 9],
      [2, 8],
      [3, 7],
      [4, 6],
      [9, 1],
      [8, 2],
      [7, 3],
      [6, 4]
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
   * @param {Array<number|null>} tiles Current partially filled board.
   * @param {number} width Board width.
   * @param {number} index Index to populate.
   * @param {number|null} nextForcedValue Upcoming forced value, if one exists.
   * @returns {number} Safe filler digit.
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
   * Collect forbidden values based on already placed neighbors and optional future constraints.
   * @param {Array<number|null>} tiles Current board state.
   * @param {number} width Board width.
   * @param {number} index Target index.
   * @param {number|null} nextForcedValue Forced value to appear next in sequence, if any.
   * @returns {Set<number>} Values that should not be used at the index.
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

    if (typeof nextForcedValue === "number") {
      register(forbidden, nextForcedValue);
    }

    return forbidden;
  }

  /**
   * Register a value and its complement as forbidden for immediate placement.
   * @param {Set<number>} forbidden Collection of disallowed values.
   * @param {number|null|undefined} value Value to mark as forbidden.
   * @returns {void}
   */
  static registerForbiddenValue(forbidden, value) {
    if (typeof value !== "number") {
      return;
    }

    forbidden.add(value);
    const complement = NumberMatchGame.getComplement(value);
    forbidden.add(complement);
  }

  /**
   * Compute the complement digit that forms a sum-to-ten relationship.
   * @param {number} value Value between 1 and 9.
   * @returns {number} Complement digit.
   */
  static getComplement(value) {
    if (value === 5) {
      return 5;
    }
    const complement = 10 - value;
    return Math.min(9, Math.max(1, complement));
  }

  /**
   * Build the reserve pile so that complements exist for non-matching board values.
  * @param {Array<number|null>} boardTiles Generated board.
   * @param {number} boardCapacity Total board slots.
   * @returns {number[]} Reserve tiles array.
   */
  static buildReserveTiles(boardTiles, boardCapacity) {
    const reserve = [];

    boardTiles.forEach((value) => {
      if (typeof value !== "number") {
        return;
      }
      reserve.push(NumberMatchGame.getComplement(value));
    });

    while (reserve.length < Math.ceil(boardCapacity * 1.1)) {
      const [first, second] = NumberMatchGame.generatePair();
      reserve.push(first, second);
    }

    return shuffle(reserve);
  }
}

/**
 * UI controller responsible for rendering and interactions.
 */
class NumberMatchUI {
  /**
   * @param {NumberMatchGame} game Game state instance.
   */
  constructor(game) {
    this.game = game;
    this.boardElement = /** @type {HTMLElement} */ (document.getElementById("board"));
    this.messageElement = /** @type {HTMLElement} */ (document.getElementById("message"));
    this.matchesElement = /** @type {HTMLElement} */ (document.getElementById("matchesCount"));
    this.tilesRemainingElement = /** @type {HTMLElement} */ (document.getElementById("tilesRemaining"));
    this.addNumbersElement = /** @type {HTMLElement} */ (document.getElementById("addNumbersUsed"));
    this.addNumbersBadgeElement = /** @type {HTMLElement} */ (document.getElementById("addNumbersCounter"));
    this.hintsElement = /** @type {HTMLElement} */ (document.getElementById("hintsUsed"));
    this.addNumbersButton = /** @type {HTMLButtonElement} */ (document.getElementById("addNumbersButton"));
    this.hintButton = /** @type {HTMLButtonElement} */ (document.getElementById("hintButton"));
    this.newGameButton = /** @type {HTMLButtonElement} */ (document.getElementById("newGameButton"));
    this.newGameDialogBackdrop = /** @type {HTMLElement | null} */ (document.getElementById("newGameDialogBackdrop"));
    this.newGameDialog = /** @type {HTMLElement | null} */ (document.getElementById("newGameDialog"));
    this.newGameConfirmButton = /** @type {HTMLButtonElement | null} */ (document.getElementById("confirmNewGameButton"));
    this.newGameCancelButton = /** @type {HTMLButtonElement | null} */ (document.getElementById("cancelNewGameButton"));
    this.previouslyFocusedElement = null;

    this.selectedIndices = [];
    this.matchesCleared = 0;
    this.addNumbersUsed = 0;
    this.hintsUsed = 0;
    this.highlightedIndices = [];
  }

  /**
   * Initialize event listeners and render the starting board.
   * @returns {void}
   */
  init() {
    this.bindControlEvents();
    const restored = this.restoreState();
    this.renderBoard();
    this.updateMetrics();
    this.hintButton.disabled = this.game.isComplete();
    if (restored) {
      this.showMessage("Welcome back! Your last board was restored.", "success");
    } else {
      this.showMessage("Select two tiles that match or sum to ten.");
    }
    this.persistState();
  }

  /**
   * Attach event listeners to control buttons.
   * @returns {void}
   */
  bindControlEvents() {
    this.addNumbersButton.addEventListener("click", () => {
      const remainingUses = NumberMatchUI.ADD_NUMBERS_LIMIT - this.addNumbersUsed;
      const appended = this.game.addNumbers(remainingUses);
      if (appended) {
        if (remainingUses > 0) {
          this.addNumbersUsed += 1;
        }
        this.showMessage("Numbers duplicated to the end of the grid.", "success");
        this.selectedIndices = [];
        this.clearHighlights();
        this.renderBoard();
        this.updateMetrics();
        this.persistState();
      } else {
        this.showMessage("No numbers remain to duplicate.", "error");
        this.updateAddNumbersPrompt();
      }
    });

    this.hintButton.addEventListener("click", () => {
      const hint = this.findHintPair();
      if (!hint) {
        this.showMessage("No matches available. Try adding numbers.", "error");
        this.updateAddNumbersPrompt();
        return;
      }
      this.selectedIndices = [];
      this.highlightedIndices = hint;
      this.hintsUsed += 1;
      this.renderBoard();
      this.updateMetrics();
      this.showMessage("Try matching the highlighted tiles.");
      this.persistState();
    });

    this.newGameButton.addEventListener("click", () => {
      this.openNewGameDialog();
    });

    if (this.newGameDialogBackdrop && this.newGameConfirmButton && this.newGameCancelButton) {
      this.newGameConfirmButton.addEventListener("click", () => {
        this.closeNewGameDialog();
        this.startNewGame();
      });

      this.newGameCancelButton.addEventListener("click", () => {
        this.closeNewGameDialog();
      });

      this.newGameDialogBackdrop.addEventListener("mousedown", (event) => {
        if (event.target === this.newGameDialogBackdrop) {
          this.closeNewGameDialog();
        }
      });

      this.newGameDialogBackdrop.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.closeNewGameDialog();
        }
      });
    }
  }

  /**
   * Handle tile clicks and manage selection/matching lifecycle.
   * @param {number} index Tile index that was clicked.
   * @returns {void}
   */
  handleTileClick(index) {
    const tiles = this.game.getTiles();
    this.clearHighlights();
    if (tiles[index] === null) {
      return;
    }

    if (this.selectedIndices.includes(index)) {
      this.selectedIndices = this.selectedIndices.filter((item) => item !== index);
      this.renderBoard();
      return;
    }

    this.selectedIndices.push(index);

    if (this.selectedIndices.length < 2) {
      this.renderBoard();
      return;
    }

    this.renderBoard();
    this.clearHighlights();
    const [first, second] = this.selectedIndices;
    const didMatch = this.game.selectPair(first, second);
    if (didMatch) {
      this.matchesCleared += 1;
      this.selectedIndices = [];
      this.renderBoard();
      this.updateMetrics();
      this.showMessage("Great match!", "success");
      if (this.game.isComplete()) {
        this.showMessage("Board cleared! Start a new game when you are ready.", "success");
        this.addNumbersButton.disabled = true;
        this.hintButton.disabled = true;
        this.clearHighlights();
      }
      this.persistState();
      return;
    }

    this.selectedIndices = [second];
    this.renderBoard();
  }

  /**
   * Render the board based on the current game state.
   * @returns {void}
   */
  renderBoard() {
    const tiles = this.game.getTiles();
    this.boardElement.innerHTML = "";
    this.boardElement.style.gridTemplateColumns = `repeat(${this.game.width}, minmax(0, 1fr))`;
    tiles.forEach((value, index) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile";
      tile.dataset.index = index.toString();
      if (value === null) {
        tile.classList.add("tile--empty");
        tile.disabled = true;
        tile.setAttribute("aria-hidden", "true");
      } else {
        tile.textContent = String(value);
        tile.addEventListener("click", () => this.handleTileClick(index));
      }
      if (this.selectedIndices.includes(index)) {
        tile.classList.add("tile--selected");
      }
      if (this.highlightedIndices.includes(index)) {
        tile.classList.add("tile--hinted");
      }
      this.boardElement.appendChild(tile);
    });
    this.updateAddNumbersPrompt();
  }

  /**
   * Update score-related UI metrics.
   * @returns {void}
   */
  updateMetrics() {
    this.matchesElement.textContent = String(this.matchesCleared);
    this.tilesRemainingElement.textContent = String(this.game.getRemainingCount());
    this.addNumbersElement.textContent = `${this.addNumbersUsed}/${NumberMatchUI.ADD_NUMBERS_LIMIT}`;
    this.hintsElement.textContent = String(this.hintsUsed);
    this.updateAddNumbersBadge();
  }

  /**
   * Reflect remaining Add Numbers uses in the badge.
   * @returns {void}
   */
  updateAddNumbersBadge() {
    const remaining = Math.max(0, NumberMatchUI.ADD_NUMBERS_LIMIT - this.addNumbersUsed);
    if (this.addNumbersBadgeElement) {
      this.addNumbersBadgeElement.textContent = String(remaining);
      this.addNumbersBadgeElement.classList.toggle("board-action__badge--empty", remaining === 0);
    }
  }

  /**
   * Clear any highlighted tile indices.
   * @returns {void}
   */
  clearHighlights() {
    this.highlightedIndices = [];
  }

  /**
   * Display a status message with optional styling.
   * @param {string} message Message to display.
   * @param {"success"|"error"|"info"} [type="info"] Message type for styling.
   * @returns {void}
   */
  showMessage(message, type = "info") {
    this.messageElement.textContent = message;
    this.messageElement.classList.remove("status__message--error", "status__message--success");
    if (type === "success") {
      this.messageElement.classList.add("status__message--success");
    } else if (type === "error") {
      this.messageElement.classList.add("status__message--error");
    }
  }

  /**
   * Reset state and begin a new puzzle.
   * @returns {void}
   */
  startNewGame() {
    this.game.reset();
    this.matchesCleared = 0;
    this.addNumbersUsed = 0;
    this.hintsUsed = 0;
    this.selectedIndices = [];
    this.addNumbersButton.disabled = false;
    this.hintButton.disabled = false;
    this.clearHighlights();
    this.renderBoard();
    this.updateMetrics();
    this.showMessage("New puzzle loaded. Good luck!", "success");
    this.hintButton.disabled = false;
    this.persistState();
  }

  /**
   * Display the custom new game confirmation dialog.
   * @returns {void}
   */
  openNewGameDialog() {
    if (!this.newGameDialogBackdrop || !this.newGameDialog || !this.newGameConfirmButton) {
      this.startNewGame();
      return;
    }

    this.previouslyFocusedElement = document.activeElement;
    this.newGameDialogBackdrop.hidden = false;
    requestAnimationFrame(() => {
      this.newGameDialogBackdrop.classList.add("is-visible");
      this.newGameDialogBackdrop.setAttribute("aria-hidden", "false");
      this.newGameDialog.focus({ preventScroll: true });
      this.newGameConfirmButton.focus({ preventScroll: true });
    });
  }

  /**
   * Hide the custom new game dialog and restore focus.
   * @returns {void}
   */
  closeNewGameDialog() {
    if (!this.newGameDialogBackdrop) {
      return;
    }
    this.newGameDialogBackdrop.classList.remove("is-visible");
    this.newGameDialogBackdrop.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (this.newGameDialogBackdrop) {
        this.newGameDialogBackdrop.hidden = true;
      }
    }, 180);

    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus({ preventScroll: true });
    }
  }

  /**
   * Determine whether any valid matches remain on the board.
   * @returns {boolean} True if at least one valid pair exists.
   */
  hasAvailableMoves() {
    return NumberMatchUI.findFirstValidPair(this.game) !== null;
  }

  /**
   * Update Add Numbers control state, including glow cues and disabling logic.
   * @returns {void}
   */
  updateAddNumbersPrompt() {
    const hasNumbersRemaining = this.game.getRemainingCount() > 0;
    const activeAction = hasNumbersRemaining && !this.game.isComplete();
    this.addNumbersButton.disabled = !activeAction;

    const noMoves = !this.hasAvailableMoves();
    const shouldGlow = noMoves && hasNumbersRemaining && activeAction;
    this.addNumbersButton.classList.toggle("board-action--attention", shouldGlow);
    this.updateAddNumbersBadge();
  }

  /**
   * Persist the current board and score metrics to localStorage.
   * @returns {void}
   */
  persistState() {
    try {
      const storage = window.localStorage;
      if (!storage) {
        return;
      }
      const state = {
        version: NumberMatchUI.STORAGE_VERSION,
        width: this.game.width,
        tiles: this.game.getTiles(),
        reserveTiles: Array.isArray(this.game.reserveTiles) ? [...this.game.reserveTiles] : undefined,
        matchesCleared: this.matchesCleared,
        addNumbersUsed: this.addNumbersUsed,
        hintsUsed: this.hintsUsed,
        timestamp: Date.now()
      };
      storage.setItem(NumberMatchUI.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("[NumberMatch] Failed to persist state", error);
    }
  }

  /**
   * Attempt to restore board and metrics from localStorage.
   * @returns {boolean} True when a valid state was restored.
   */
  restoreState() {
    try {
      const storage = window.localStorage;
      if (!storage) {
        return false;
      }
      const raw = storage.getItem(NumberMatchUI.STORAGE_KEY);
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== NumberMatchUI.STORAGE_VERSION) {
        return false;
      }
      if (parsed.width !== this.game.width || !Array.isArray(parsed.tiles)) {
        return false;
      }

      const tiles = parsed.tiles.map((value) => {
        if (value === null) {
          return null;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
      });

      if (tiles.length === 0 || tiles.every((value) => value === undefined)) {
        return false;
      }

      this.game.tiles = tiles;
      if (Array.isArray(parsed.reserveTiles)) {
        this.game.reserveTiles = parsed.reserveTiles
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
      }

      const numericOrDefault = (value, fallback, clampMin = null, clampMax = null) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          return fallback;
        }
        let result = numeric;
        if (clampMin !== null) {
          result = Math.max(clampMin, result);
        }
        if (clampMax !== null) {
          result = Math.min(clampMax, result);
        }
        return result;
      };

      this.matchesCleared = numericOrDefault(parsed.matchesCleared, 0, 0, Number.MAX_SAFE_INTEGER);
      this.addNumbersUsed = numericOrDefault(parsed.addNumbersUsed, 0, 0, NumberMatchUI.ADD_NUMBERS_LIMIT);
      this.hintsUsed = numericOrDefault(parsed.hintsUsed, 0, 0, Number.MAX_SAFE_INTEGER);
      this.selectedIndices = [];
      this.highlightedIndices = [];
      return true;
    } catch (error) {
      console.error("[NumberMatch] Failed to restore state", error);
      return false;
    }
  }

  /**
   * Find a valid pair of tiles for hint functionality.
NumberMatchUI.STORAGE_KEY = "numbermatch-state-v1";
NumberMatchUI.STORAGE_VERSION = 1;
   * @returns {[number, number] | null} Tuple of indices or null when no match exists.
   */
  findHintPair() {
    return NumberMatchUI.findFirstValidPair(this.game);
  }

  /**
   * Compute the first valid pair of tiles available.
   * @param {NumberMatchGame} game Game state instance to inspect.
   * @returns {[number, number] | null} Indices representing a valid pair or null.
   */
  static findFirstValidPair(game) {
    const tiles = game.getTiles();
    for (let i = 0; i < tiles.length; i += 1) {
      if (tiles[i] === null) {
        continue;
      }
      for (let j = i + 1; j < tiles.length; j += 1) {
        if (tiles[j] === null) {
          continue;
        }
        if (game.canPair(i, j)) {
          return [i, j];
        }
      }
    }
    return null;
  }
}

NumberMatchUI.ADD_NUMBERS_LIMIT = 3;

window.addEventListener("DOMContentLoaded", () => {
  const game = new NumberMatchGame({ width: 9, rows: 6 });
  const ui = new NumberMatchUI(game);
  ui.init();
});
