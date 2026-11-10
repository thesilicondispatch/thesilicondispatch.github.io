/**
 * The Silicon Dispatch - Blogger Editor Engine
 * 
 * Reproduces the Blogger.com dual-mode editing experience:
 * - Compose View (WYSIWYG rich text editor with vintage typesetting)
 * - HTML View (Raw source code editor with tag helpers & formatter)
 * - Bidirectional real-time DOM synchronization
 * - Strict DOMParser allowlist HTML sanitizer (zero images, zero XSS vectors)
 * - Image-free paste & drop sanitizer
 * - Live active toolbar state highlighting & word/read-time indicator
 * - Unsaved changes tracking, Broadside Preview & Hyperlink Dialog
 */
(function (global) {
    "use strict";

    let currentPostId = null;
    let currentMode = "compose"; // "compose" | "html"
    let isDirty = false;
    let initialSnapshot = "";
    let onSaveCallback = null;
    let onToastCallback = null;
    let modalManager = null;
    let savedSelectionRange = null;

    const elements = {};

    const ICON_COMPOSE = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_CODE = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

    const ALLOWED_TAGS = new Set([
        "p", "br", "hr", "div", "span",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "strong", "b", "em", "i", "u", "s", "del", "ins", "sub", "sup", "mark", "small", "font",
        "blockquote", "cite", "q", "abbr", "time",
        "pre", "code", "kbd", "samp", "var",
        "ul", "ol", "li", "dl", "dt", "dd",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
        "a", "details", "summary"
    ]);

    const BLOCKED_CONTAINERS = new Set([
        "script", "style", "svg", "math", "iframe", "frame", "frameset",
        "object", "embed", "applet", "form", "input", "textarea", "select",
        "button", "base", "meta", "link", "noscript", "template", "img",
        "picture", "video", "audio", "source", "canvas", "map", "area"
    ]);

    const ALLOWED_ATTRS = new Set([
        "class", "id", "title", "href", "target", "rel",
        "colspan", "rowspan", "scope", "datetime", "open", "color", "align", "style"
    ]);

    function isSafeUrl(urlStr) {
        if (!urlStr || typeof urlStr !== "string") return false;
        const trimmed = urlStr.trim();
        if (!trimmed) return false;
        if (trimmed.startsWith("#") || (trimmed.startsWith("/") && !trimmed.startsWith("//"))) {
            return true;
        }
        try {
            const parsed = new URL(trimmed, "https://dispatch.invalid");
            const proto = parsed.protocol.toLowerCase();
            return proto === "http:" || proto === "https:" || proto === "mailto:";
        } catch (_) {
            return false;
        }
    }

    function sanitizeInlineStyle(styleText) {
        if (!styleText) return "";
        const safeDecls = [];
        const decls = styleText.split(";");
        for (let i = 0; i < decls.length; i++) {
            const parts = decls[i].split(":");
            if (parts.length < 2) continue;
            const prop = parts[0].trim().toLowerCase();
            const val = parts.slice(1).join(":").trim();
            if (!val || /url\s*\(|expression\s*\(|@import|javascript:/i.test(val)) continue;
            if (prop === "color" || prop === "background-color") {
                if (/^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]{3,20})$/.test(val)) {
                    safeDecls.push(`${prop}: ${val}`);
                }
            } else if (prop === "text-align") {
                if (/^(left|right|center|justify|start|end)$/.test(val)) {
                    safeDecls.push(`${prop}: ${val}`);
                }
            }
        }
        return safeDecls.join("; ");
    }

    function sanitizeNodeRecursive(node, targetDoc) {
        if (node.nodeType === 3) {
            return targetDoc.createTextNode(node.nodeValue || "");
        }
        if (node.nodeType !== 1) {
            return null;
        }

        const tag = node.tagName.toLowerCase();
        if (BLOCKED_CONTAINERS.has(tag)) {
            return null;
        }

        if (!ALLOWED_TAGS.has(tag)) {
            const frag = targetDoc.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => {
                const cleanChild = sanitizeNodeRecursive(child, targetDoc);
                if (cleanChild) frag.appendChild(cleanChild);
            });
            return frag;
        }

        const cleanEl = targetDoc.createElement(tag);
        const attrs = node.attributes;
        for (let i = 0; i < attrs.length; i++) {
            const attrName = attrs[i].name.toLowerCase();
            const attrVal = attrs[i].value;
            if (attrName.startsWith("on") || !ALLOWED_ATTRS.has(attrName)) {
                continue;
            }
            if (attrName === "href") {
                if (tag === "a" && isSafeUrl(attrVal)) {
                    cleanEl.setAttribute("href", attrVal.trim());
                }
            } else if (attrName === "style") {
                const safeStyle = sanitizeInlineStyle(attrVal);
                if (safeStyle) cleanEl.setAttribute("style", safeStyle);
            } else if (attrName === "target") {
                if (tag === "a" && attrVal === "_blank") {
                    cleanEl.setAttribute("target", "_blank");
                }
            } else if (attrName === "color" && tag === "font") {
                if (/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(attrVal.trim())) {
                    cleanEl.setAttribute("color", attrVal.trim());
                }
            } else if (attrName === "open" && tag === "details") {
                cleanEl.setAttribute("open", "");
            } else {
                cleanEl.setAttribute(attrName, attrVal);
            }
        }

        if (tag === "a" && cleanEl.hasAttribute("href")) {
            const href = cleanEl.getAttribute("href");
            if (!href.startsWith("#")) {
                cleanEl.setAttribute("target", "_blank");
                cleanEl.setAttribute("rel", "noopener noreferrer");
            }
        }

        Array.from(node.childNodes).forEach(child => {
            const cleanChild = sanitizeNodeRecursive(child, targetDoc);
            if (cleanChild) cleanEl.appendChild(cleanChild);
        });

        return cleanEl;
    }

    function sanitizeHtml(rawHtml) {
        if (!rawHtml || typeof rawHtml !== "string") return "";
        const parser = new DOMParser();
        const parsed = parser.parseFromString(rawHtml, "text/html");
        const out = document.createElement("div");

        Array.from(parsed.body.childNodes).forEach(node => {
            const clean = sanitizeNodeRecursive(node, document);
            if (clean) out.appendChild(clean);
        });

        return out.innerHTML;
    }

    function getTodayLocalISO() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function initEditor(domRefs, callbacks) {
        Object.assign(elements, domRefs);
        if (typeof callbacks === "function") {
            onSaveCallback = callbacks;
        } else if (callbacks) {
            onSaveCallback = callbacks.onSave || null;
            onToastCallback = callbacks.onToast || null;
            modalManager = callbacks.modalManager || null;
        }

        setupToolbarListeners();
        setupViewSwitcher();
        setupLinkModal();
        setupPreviewModal();
        setupPasteAndDropSanitizer();
        setupLiveStatsAndDirtyTracking();
        setupToolbarActiveStates();
        setupShortcuts();
    }

    function openDialog(modal) {
        if (modalManager && modalManager.open) {
            modalManager.open(modal);
        } else if (modal) {
            modal.classList.add("open");
        }
    }

    function closeDialog(modal) {
        if (modalManager && modalManager.close) {
            modalManager.close(modal);
        } else if (modal) {
            modal.classList.remove("open");
        }
    }

    function notify(message, type = "info") {
        if (onToastCallback) {
            onToastCallback(message, type);
        } else if (global.DispatchApp && global.DispatchApp.showToast) {
            global.DispatchApp.showToast(message, type);
        }
    }

    function markDirty() {
        isDirty = true;
    }

    function setupViewSwitcher() {
        if (!elements.viewSwitchBtn || !elements.viewMenu) return;

        const closeMenu = () => {
            elements.viewMenu.classList.remove("open");
            elements.viewSwitchBtn.setAttribute("aria-expanded", "false");
        };

        elements.viewSwitchBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = elements.viewMenu.classList.toggle("open");
            elements.viewSwitchBtn.setAttribute("aria-expanded", String(isOpen));
        });

        document.addEventListener("click", (e) => {
            if (!elements.viewSwitchBtn.contains(e.target) && !elements.viewMenu.contains(e.target)) {
                closeMenu();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && elements.viewMenu.classList.contains("open")) {
                closeMenu();
                elements.viewSwitchBtn.focus();
            }
        });

        if (elements.optComposeView) {
            elements.optComposeView.addEventListener("click", () => {
                switchToMode("compose");
                closeMenu();
            });
        }

        if (elements.optHtmlView) {
            elements.optHtmlView.addEventListener("click", () => {
                switchToMode("html");
                closeMenu();
            });
        }
    }

    function switchToMode(newMode) {
        if (currentMode === newMode) return;

        if (newMode === "html") {
            const richHtml = sanitizeHtml(elements.composeEditor.innerHTML);
            elements.htmlEditor.value = formatHtml(richHtml);

            elements.composeContainer.style.display = "none";
            elements.htmlContainer.style.display = "block";
            elements.composeToolbar.style.display = "none";
            elements.htmlToolbar.style.display = "flex";

            elements.currentModeLabel.innerHTML = `${ICON_CODE} HTML view`;
            currentMode = "html";
            elements.htmlEditor.focus();
        } else {
            const rawHtml = sanitizeHtml(elements.htmlEditor.value);
            elements.composeEditor.innerHTML = rawHtml && rawHtml.trim() ? rawHtml : "<p><br></p>";

            elements.htmlContainer.style.display = "none";
            elements.composeContainer.style.display = "block";
            elements.htmlToolbar.style.display = "none";
            elements.composeToolbar.style.display = "flex";

            elements.currentModeLabel.innerHTML = `${ICON_COMPOSE} Compose view`;
            currentMode = "compose";
            elements.composeEditor.focus();
        }
        updateLiveStats();
        updateToolbarActiveStates();
    }

    function formatHtml(html) {
        let formatted = "";
        let indent = 0;
        const tab = "  ";

        const clean = (html || "")
            .replace(/>\s*</g, "><")
            .replace(/&nbsp;/g, " ")
            .trim();

        const tokens = clean.split(/(<[^>]+>)/g).filter(Boolean);
        const inlineTags = ["b", "i", "u", "s", "strong", "em", "code", "span", "a", "sub", "sup", "font", "mark", "small", "abbr", "time", "del", "ins"];
        const voidTags = ["br", "hr", "input", "col"];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const isTag = token.startsWith("<") && token.endsWith(">");

            if (isTag) {
                const isClosing = token.startsWith("</");
                const isSelfClosing = token.endsWith("/>") || voidTags.some(vt => token.toLowerCase().startsWith(`<${vt}`));
                const tagNameMatch = token.match(/<\/?([a-zA-Z0-9]+)/);
                const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : "";

                if (inlineTags.includes(tagName)) {
                    formatted += token;
                } else if (isClosing) {
                    indent = Math.max(0, indent - 1);
                    formatted += "\n" + tab.repeat(indent) + token;
                } else if (isSelfClosing) {
                    formatted += "\n" + tab.repeat(indent) + token;
                } else {
                    formatted += "\n" + tab.repeat(indent) + token;
                    indent++;
                }
            } else {
                const text = token.trim();
                if (text) {
                    formatted += text;
                }
            }
        }

        return formatted.trim();
    }

    function executeCommand(command, value = null) {
        elements.composeEditor.focus();
        document.execCommand(command, false, value);
        markDirty();
        updateLiveStats();
        updateToolbarActiveStates();
    }

    function setupToolbarListeners() {
        document.querySelectorAll("[data-command]").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const cmd = btn.getAttribute("data-command");
                const val = btn.getAttribute("data-value") || null;

                if (cmd === "createLink") {
                    openLinkModal();
                } else if (cmd === "formatBlock") {
                    executeCommand("formatBlock", val && !val.startsWith("<") ? `<${val}>` : val);
                } else if (cmd === "insertCode") {
                    insertCodeSnippet();
                } else {
                    executeCommand(cmd, val);
                }
            });
        });

        if (elements.headingSelect) {
            elements.headingSelect.addEventListener("change", (e) => {
                const val = e.target.value;
                if (val) {
                    executeCommand("formatBlock", `<${val}>`);
                    elements.headingSelect.value = "";
                }
            });
        }

        if (elements.foreColorPicker) {
            elements.foreColorPicker.addEventListener("change", (e) => {
                executeCommand("foreColor", e.target.value);
            });
        }

        document.querySelectorAll("[data-html-insert]").forEach(btn => {
            btn.addEventListener("click", () => {
                const tag = btn.getAttribute("data-html-insert");
                insertHtmlTag(tag);
            });
        });

        if (elements.btnFormatHtml) {
            elements.btnFormatHtml.addEventListener("click", () => {
                elements.htmlEditor.value = formatHtml(sanitizeHtml(elements.htmlEditor.value));
                updateLiveStats();
                notify("HTML markup formatted.", "info");
            });
        }

        if (elements.btnPublish) {
            elements.btnPublish.addEventListener("click", () => saveCurrentPost(false));
        }

        if (elements.btnDraft) {
            elements.btnDraft.addEventListener("click", () => saveCurrentPost(true));
        }
    }

    function setupToolbarActiveStates() {
        const statefulCommands = [
            "bold", "italic", "underline", "strikeThrough",
            "insertUnorderedList", "insertOrderedList",
            "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"
        ];

        const sync = () => {
            if (currentMode !== "compose") return;
            const active = document.activeElement;
            if (!active || !elements.composeEditor || !elements.composeEditor.contains(active)) return;

            statefulCommands.forEach(cmd => {
                const btn = document.querySelector(`[data-command="${cmd}"]`);
                if (!btn) return;
                let activeState = false;
                try {
                    activeState = document.queryCommandState(cmd);
                } catch (_) {}
                btn.classList.toggle("active", Boolean(activeState));
                btn.setAttribute("aria-pressed", String(Boolean(activeState)));
            });
        };

        if (elements.composeEditor) {
            elements.composeEditor.addEventListener("keyup", sync);
            elements.composeEditor.addEventListener("mouseup", sync);
            elements.composeEditor.addEventListener("focus", sync);
        }
        document.addEventListener("selectionchange", sync);
    }

    function updateToolbarActiveStates() {
        document.querySelectorAll("[data-command][aria-pressed]").forEach(btn => {
            const cmd = btn.getAttribute("data-command");
            let activeState = false;
            if (currentMode === "compose") {
                try {
                    activeState = document.queryCommandState(cmd);
                } catch (_) {}
            }
            btn.classList.toggle("active", Boolean(activeState));
            btn.setAttribute("aria-pressed", String(Boolean(activeState)));
        });
    }

    function saveCurrentSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && elements.composeEditor.contains(sel.anchorNode)) {
            savedSelectionRange = sel.getRangeAt(0).cloneRange();
        } else {
            savedSelectionRange = null;
        }
    }

    function restoreSelection() {
        elements.composeEditor.focus();
        if (savedSelectionRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedSelectionRange);
        }
    }

    function setupLinkModal() {
        const modal = document.getElementById("insertLinkModal");
        const closeBtn = document.getElementById("closeLinkModalBtn");
        const form = document.getElementById("insertLinkForm");

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", () => closeDialog(modal));
        }

        if (form) {
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const url = (document.getElementById("linkUrlInput").value || "").trim();
                const text = (document.getElementById("linkTextInput").value || "").trim();

                if (!isSafeUrl(url)) {
                    notify("Please enter a valid http://, https://, or mailto: URL.", "error");
                    return;
                }

                restoreSelection();

                const sel = window.getSelection();
                if (sel && sel.toString().trim().length > 0) {
                    executeCommand("createLink", url);
                    // Ensure newly created links open safely in a new tab
                    elements.composeEditor.querySelectorAll("a[href]").forEach(a => {
                        if (a.getAttribute("href") === url) {
                            a.setAttribute("target", "_blank");
                            a.setAttribute("rel", "noopener noreferrer");
                        }
                    });
                } else {
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.textContent = text || url;
                    anchor.target = "_blank";
                    anchor.rel = "noopener noreferrer";

                    if (savedSelectionRange) {
                        savedSelectionRange.insertNode(anchor);
                        const range = document.createRange();
                        range.setStartAfter(anchor);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        elements.composeEditor.appendChild(anchor);
                    }
                    markDirty();
                }

                closeDialog(modal);
                form.reset();
                updateLiveStats();
            });
        }
    }

    function openLinkModal() {
        saveCurrentSelection();
        const modal = document.getElementById("insertLinkModal");
        const textInput = document.getElementById("linkTextInput");
        const urlInput = document.getElementById("linkUrlInput");
        if (!modal) return;

        const selText = savedSelectionRange ? savedSelectionRange.toString().trim() : "";
        if (textInput) textInput.value = selText;
        if (urlInput) urlInput.value = "https://";
        openDialog(modal);
        if (urlInput) urlInput.focus();
    }

    function setupPreviewModal() {
        const btnPreview = document.getElementById("btnPreviewDispatch");
        const modal = document.getElementById("previewBroadsideModal");
        const closeBtn = document.getElementById("closePreviewModalBtn");
        const body = document.getElementById("previewModalBody");

        if (btnPreview && modal && body) {
            btnPreview.addEventListener("click", () => {
                const title = (elements.inputTitle.value || "").trim() || "Untitled Broadside";
                const category = (elements.inputCategory.value || "Architecture").trim();
                const summary = (elements.inputSummary.value || "").trim();
                let content = sanitizeHtml(getEditorContent());

                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = content;
                const firstP = tempDiv.querySelector("p");
                if (firstP && !firstP.classList.contains("drop-cap")) {
                    firstP.classList.add("drop-cap");
                }
                tempDiv.querySelectorAll("table").forEach(table => {
                    const wrap = document.createElement("div");
                    wrap.className = "table-scroll-wrap";
                    table.parentNode.insertBefore(wrap, table);
                    wrap.appendChild(table);
                });

                body.innerHTML = `
                    <div class="reader-header" style="margin-bottom: 1.5rem;">
                        <div class="reader-kicker">
                            <span class="category-pill">${escapeHtml(category)}</span>
                            <span class="pub-date">${escapeHtml(elements.inputDate.value || "TODAY")}</span>
                        </div>
                        <h1 class="reader-title">${escapeHtml(title)}</h1>
                        ${summary ? `<p class="reader-subheadline">${escapeHtml(summary)}</p>` : ""}
                        <div class="reader-author-rule">
                            <span class="rule-line"></span>
                            <span class="rule-ornament" aria-hidden="true">&#10070;</span>
                            <span class="rule-line"></span>
                        </div>
                    </div>
                    <div class="reader-body">${tempDiv.innerHTML}</div>
                `;
                openDialog(modal);
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", () => closeDialog(modal));
        }
    }

    function setupPasteAndDropSanitizer() {
        if (!elements.composeEditor) return;

        elements.composeEditor.addEventListener("paste", (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const htmlData = clipboardData.getData("text/html");
            const textData = clipboardData.getData("text/plain");

            if (htmlData) {
                e.preventDefault();
                const cleaned = sanitizeHtml(htmlData);
                document.execCommand("insertHTML", false, cleaned);
                markDirty();
                updateLiveStats();
            } else if (textData) {
                setTimeout(() => {
                    markDirty();
                    updateLiveStats();
                }, 10);
            }
        });

        elements.composeEditor.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            if (!dt) return;
            if (dt.files && dt.files.length > 0) {
                e.preventDefault();
                notify("Images and binary files are disallowed in this pure-text broadsheet.", "error");
                return;
            }
            const htmlData = dt.getData("text/html");
            if (htmlData) {
                e.preventDefault();
                const cleaned = sanitizeHtml(htmlData);
                document.execCommand("insertHTML", false, cleaned);
                markDirty();
                updateLiveStats();
            }
        });
    }

    function setupLiveStatsAndDirtyTracking() {
        const metaInputs = [
            elements.inputTitle,
            elements.inputCategory,
            elements.inputSummary,
            elements.inputDate
        ];

        metaInputs.forEach(input => {
            if (input) input.addEventListener("input", markDirty);
        });

        if (elements.composeEditor) {
            elements.composeEditor.addEventListener("input", () => {
                markDirty();
                updateLiveStats();
            });
        }
        if (elements.htmlEditor) {
            elements.htmlEditor.addEventListener("input", () => {
                markDirty();
                updateLiveStats();
            });
        }
    }

    function updateLiveStats() {
        const wordEl = document.getElementById("editorWordCount");
        const readEl = document.getElementById("editorReadEstimate");
        if (!wordEl || !readEl) return;

        const html = getEditorContent();
        const tmp = document.createElement("div");
        tmp.innerHTML = String(html || "").replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr|td|th)>/gi, "$& ");
        const text = (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;
        const mins = Math.max(1, Math.round(words / 200));

        wordEl.textContent = `${words} words • ${chars} chars`;
        readEl.textContent = `${mins} min read`;
    }

    function insertCodeSnippet() {
        elements.composeEditor.focus();
        const selection = window.getSelection();
        let range;

        if (selection && selection.rangeCount > 0 && elements.composeEditor.contains(selection.anchorNode)) {
            range = selection.getRangeAt(0);
        } else {
            range = document.createRange();
            range.selectNodeContents(elements.composeEditor);
            range.collapse(false);
        }

        const selectedText = range.toString() || "// Enter code snippet here";

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.className = "newspaper-code";
        code.textContent = selectedText;
        pre.appendChild(code);

        range.deleteContents();
        range.insertNode(pre);

        const p = document.createElement("p");
        p.innerHTML = "<br>";
        pre.after(p);

        range.setStart(p, 0);
        range.collapse(true);
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        markDirty();
        updateLiveStats();
    }

    function insertHtmlTag(tag) {
        const textarea = elements.htmlEditor;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);

        let openTag = `<${tag}>`;
        let closeTag = `</${tag}>`;

        if (tag === "hr") {
            openTag = '<hr class="vintage-divider" />';
            closeTag = "";
        } else if (tag === "codeblock") {
            openTag = '<pre><code class="newspaper-code">';
            closeTag = '</code></pre>';
        }

        const replacement = openTag + (selected || (tag === "hr" ? "" : "Text here")) + closeTag;
        textarea.setRangeText(replacement, start, end, "select");
        textarea.focus();
        markDirty();
        updateLiveStats();
    }

    function setupShortcuts() {
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                const container = elements.editorContainer;
                const isVisible = container && !container.hidden && window.getComputedStyle(container).display !== "none";
                if (isVisible) {
                    e.preventDefault();
                    saveCurrentPost(false);
                }
            }
        });

        if (elements.htmlEditor) {
            elements.htmlEditor.addEventListener("keydown", (e) => {
                if (e.key === "Tab") {
                    e.preventDefault();
                    const start = elements.htmlEditor.selectionStart;
                    const end = elements.htmlEditor.selectionEnd;
                    elements.htmlEditor.setRangeText("  ", start, end, "end");
                    markDirty();
                }
            });
        }
    }

    function getEditorContent() {
        if (currentMode === "html") {
            return elements.htmlEditor.value;
        }
        return elements.composeEditor.innerHTML;
    }

    function setEditorContent(html) {
        const safeHtml = html ? sanitizeHtml(html) : "";
        elements.composeEditor.innerHTML = safeHtml;
        elements.htmlEditor.value = safeHtml ? formatHtml(elements.composeEditor.innerHTML) : "";
        updateLiveStats();
    }

    function getCurrentSnapshot() {
        return JSON.stringify({
            title: (elements.inputTitle && elements.inputTitle.value || "").trim(),
            category: (elements.inputCategory && elements.inputCategory.value || "").trim(),
            summary: (elements.inputSummary && elements.inputSummary.value || "").trim(),
            date: elements.inputDate && elements.inputDate.value || "",
            content: sanitizeHtml(getEditorContent())
        });
    }

    function loadPostIntoEditor(post) {
        currentPostId = post ? post.id : null;
        elements.inputTitle.value = post ? post.title : "";
        elements.inputCategory.value = post ? post.category : "Architecture";
        elements.inputSummary.value = post ? (post.summary || "") : "";
        elements.inputDate.value = post ? post.date : getTodayLocalISO();

        setEditorContent(post ? post.content : "");
        switchToMode("compose");
        isDirty = false;
        initialSnapshot = getCurrentSnapshot();

        if (elements.editorHeading) {
            elements.editorHeading.textContent = post ? "Editing Dispatch" : "Compose New Dispatch";
        }
        if (elements.editorStatusBadge) {
            elements.editorStatusBadge.textContent = post ? (post.draft ? "Draft" : "Published") : "New Article";
            elements.editorStatusBadge.className = "status-badge " + (post && post.draft ? "draft" : "published");
        }
    }

    function saveCurrentPost(isDraft = false) {
        const title = (elements.inputTitle.value || "").trim();
        if (!title) {
            notify("Please provide a headline title for this dispatch.", "error");
            elements.inputTitle.focus();
            return;
        }

        const content = sanitizeHtml(getEditorContent());
        const postData = {
            id: currentPostId || "dispatch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            title: title,
            category: (elements.inputCategory.value || "Architecture").trim(),
            summary: (elements.inputSummary.value || "").trim(),
            date: elements.inputDate.value || getTodayLocalISO(),
            content: content,
            draft: isDraft,
            updatedAt: Date.now()
        };

        currentPostId = postData.id;
        isDirty = false;
        initialSnapshot = getCurrentSnapshot();

        if (onSaveCallback) {
            onSaveCallback(postData);
        }

        if (elements.editorStatusBadge) {
            elements.editorStatusBadge.textContent = isDraft ? "Draft Saved" : "Published";
            elements.editorStatusBadge.className = "status-badge " + (isDraft ? "draft" : "published");
        }
    }

    global.DispatchBloggerEditor = {
        init: initEditor,
        loadPost: loadPostIntoEditor,
        savePost: saveCurrentPost,
        switchToMode: switchToMode,
        getContent: getEditorContent,
        sanitizeHtml: sanitizeHtml,
        hasUnsavedChanges: () => isDirty || getCurrentSnapshot() !== initialSnapshot,
        resetDirty: () => {
            isDirty = false;
            initialSnapshot = getCurrentSnapshot();
        }
    };
})(typeof window !== "undefined" ? window : globalThis);
