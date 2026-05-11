import { MarkdownRenderer } from "./MarkdownRenderer.js";

/**
 * Decodes markdown payload from a JSON script element.
 *
 * @param {HTMLScriptElement | null} payloadEl
 * @returns {string}
 */
function readMarkdownPayload(payloadEl) {
    if (!payloadEl) return "";

    try {
        const parsed = JSON.parse(payloadEl.textContent || "\"\"");
        return typeof parsed === "string" ? parsed : "";
    } catch (error) {
        console.error("Failed to parse blog markdown payload", error);
        return "";
    }
}

/**
 * Wires copy buttons rendered by MarkdownRenderer.
 *
 * @param {ParentNode} container
 * @returns {void}
 */
function wireCopyButtons(container) {
    container.querySelectorAll(".md-copy-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const code = button.getAttribute("data-code");
            if (!code) return;

            navigator.clipboard.writeText(code).then(() => {
                const originalText = button.textContent;
                button.textContent = "✓";
                button.classList.add("copied");
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove("copied");
                }, 2000);
            }).catch((error) => {
                console.error("Failed to copy code", error);
            });
        });
    });
}

/**
 * Renders blog markdown on static post pages using the shared renderer.
 *
 * @returns {void}
 */
function renderStaticBlogPost() {
    /** @type {HTMLElement | null} */
    const target = document.querySelector("[data-blog-post-content]");
    if (!target) return;

    /** @type {HTMLScriptElement | null} */
    const payload = document.querySelector("#blogPostMarkdown");
    const markdown = readMarkdownPayload(payload);

    target.innerHTML = MarkdownRenderer.render(markdown);
    MarkdownRenderer.applyImageScale(target);
    wireCopyButtons(target);
}

/**
 * Toggles the compact top bar when the hero logo scrolls out of view.
 *
 * @returns {void}
 */
function setupScrollTopBar() {
    const body = document.body;
    const bar = document.querySelector("[data-blog-scroll-topbar]");

    if (!bar) return;

    let lastScrollTop = 0;

    const applyState = () => {
        const scrollTop = body.scrollTop;
        const scrollingDown = scrollTop > lastScrollTop;
        lastScrollTop = scrollTop;

        if (scrollTop < 80) {
            body.classList.remove("blog-scrolled");
        } else if (scrollingDown) {
            body.classList.add("blog-scrolled");
        } else {
            body.classList.remove("blog-scrolled");
        }
    };
    body.addEventListener("scroll", applyState, { passive: true });
    applyState();
}

/**
 * Draws SVG bezier splines from the peek-card exec pins to the main blog card.
 *
 * @returns {void}
 */
function setupPeekSplines() {
    const svg = document.querySelector(".blog-post-splines");
    const layout = document.querySelector(".blog-post-layout");
    const card = document.querySelector(".blog-card");
    if (!svg || !layout || !card) return;

    const WIRE_COLOR = "#ffffff";
    const WIRE_OPACITY = "0.35";

    /**
     * Creates an SVG path element styled as an exec wire.
     *
     * @returns {SVGPathElement}
     */
    function makePath() {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", WIRE_COLOR);
        p.setAttribute("stroke-width", "2.5");
        p.setAttribute("stroke-linecap", "round");
        p.style.opacity = WIRE_OPACITY;
        return p;
    }

    /**
     * Returns the center of an element relative to the layout container.
     *
     * @param {Element} el
     * @returns {{x: number, y: number}}
     */
    function centerOf(el) {
        const er = el.getBoundingClientRect();
        const lr = layout.getBoundingClientRect();
        return {
            x: er.left - lr.left + er.width / 2,
            y: er.top  - lr.top  + er.height / 2,
        };
    }

    /**
     * Returns the midpoint of a card's left or right edge relative to the layout.
     *
     * @param {Element} el
     * @param {'left'|'right'} side
     * @returns {{x: number, y: number}}
     */
    function edgeOf(el, side) {
        const er = el.getBoundingClientRect();
        const lr = layout.getBoundingClientRect();
        return {
            x: side === 'left' ? er.left - lr.left : er.right - lr.left,
            y: er.top - lr.top + 158,
        };
    }

    const pathPrev = makePath();
    const pathNext = makePath();
    svg.appendChild(pathPrev);
    svg.appendChild(pathNext);

    /** @returns {void} */
    function draw() {
        const lr = layout.getBoundingClientRect();
        svg.setAttribute("width",  String(lr.width));
        svg.setAttribute("height", String(lr.height));

        const prevPin  = document.querySelector("[data-peek-pin='prev-out']");
        const nextPin  = document.querySelector("[data-peek-pin='next-in']");
        const cardLeft  = edgeOf(card, "left");
        const cardRight = edgeOf(card, "right");

        if (prevPin) {
            const s = centerOf(prevPin);
            const e = cardLeft;
            const cp = Math.max(60, Math.abs(e.x - s.x) * 0.5);
            pathPrev.setAttribute("d", `M ${s.x} ${s.y} C ${s.x + cp} ${s.y} ${e.x - cp} ${e.y} ${e.x} ${e.y}`);
        } else {
            pathPrev.setAttribute("d", "");
        }

        if (nextPin) {
            const s = cardRight;
            const e = centerOf(nextPin);
            const cp = Math.max(60, Math.abs(e.x - s.x) * 0.5);
            pathNext.setAttribute("d", `M ${s.x} ${s.y} C ${s.x + cp} ${s.y} ${e.x - cp} ${e.y} ${e.x} ${e.y}`);
        } else {
            pathNext.setAttribute("d", "");
        }
    }

    draw();
    window.addEventListener("resize", draw, { passive: true });
    window.addEventListener("scroll", draw, { passive: true });
}

/**
 * Bootstraps static blog page behaviors.
 *
 * @returns {void}
 */
function initializeBlogPage() {
    renderStaticBlogPost();
    setupScrollTopBar();
    setupPeekSplines();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeBlogPage, { once: true });
} else {
    initializeBlogPage();
}
