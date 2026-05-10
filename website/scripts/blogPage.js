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
    const heroLogo = document.querySelector(".blog-logo-link");

    if (!bar) return;

    if (heroLogo && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            ([entry]) => {
                body.classList.toggle("blog-scrolled", !entry.isIntersecting);
            },
            { threshold: 0 }
        );
        observer.observe(heroLogo);
    } else {
        // Fallback: fixed pixel threshold
        const applyState = () => {
            body.classList.toggle("blog-scrolled", window.scrollY >= 80);
        };
        window.addEventListener("scroll", applyState, { passive: true });
        applyState();
    }
}

/**
 * Bootstraps static blog page behaviors.
 *
 * @returns {void}
 */
function initializeBlogPage() {
    renderStaticBlogPost();
    setupScrollTopBar();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeBlogPage, { once: true });
} else {
    initializeBlogPage();
}
