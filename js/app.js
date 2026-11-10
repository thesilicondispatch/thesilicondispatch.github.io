/**
 * The Silicon Dispatch - Application Controller & Cloudflare Synchronization
 * 
 * - Encrypted Cloudflare Worker synchronization via WebSocket & history REST API
 * - LocalStorage caching for 0ms initial load & offline resilience
 * - Vintage newspaper front-page rendering (Broadsheet & Headlines Index modes, zero images)
 * - Full article reader with progress hairline, auto-TOC, code copy & pagination
 * - Dynamic category pills & cached plain-text archive search
 * - Daylight / Midnight edition toggle & accessible keyboard navigation
 * - Secure Admin Sanctum with automatic sign-out when returning to Front Page
 */
(function (global) {
    "use strict";

    const DEFAULT_TITLE = "The Silicon Dispatch — The Digital Brain & Tech Chronicle";
    const DEFAULT_DESCRIPTION = "A vintage broadsheet compendium of computing architecture, distributed systems, cryptographic proofs, and systems engineering.";

    const ICON_MOON = '<svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    const ICON_SUN = '<svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
    const ICON_LOCK = '<svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    const ICON_UNLOCK = '<svg class="ui-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 8.5-3.5"/></svg>';
    const ICON_PRINT = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>';
    const ICON_LINK = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    const ICON_EDIT = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_COPY = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    const ICON_TRASH = '<svg class="ui-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';

    const state = {
        posts: [],
        activeCategory: "ALL",
        searchQuery: "",
        adminSearchQuery: "",
        layoutMode: "broadsheet", // "broadsheet" | "headlines"
        currentView: "front",     // "front" | "reader" | "admin" | "editor"
        currentPostId: null,
        config: null,
        syncStatus: "idle"
    };

    let viewTransitionTimer = null;
    let currentFontSizePx = 17;
    let backToTopBtn = null;

    const plainTextCache = new WeakMap();

    const SEED_POSTS = [
        {
            id: "dispatch_consensus_01",
            title: "The Philosophy of Distributed Consensus: Paxos, Raft, and the Byzantine Frontier",
            category: "Distributed Systems",
            date: "2026-11-09",
            summary: "An inquiry into state-machine replication, network partitions, split-brain syndromes, and how asynchronous networks negotiate agreement without trusted intermediaries.",
            content: `
<p>In any distributed assembly of autonomous machines, truth is not an inherent property—it is an achievement of consensus. From Leslie Lamport's seminal formulation of Paxos to the pragmatic state-machine semantics of Raft, the fundamental challenge remains invariant: how can independent computational agents, separated by unreliable network channels, agree upon a sequence of state transitions?</p>

<h3>The Triad of Impossibility: The FLP Theorem</h3>
<p>The theoretical cornerstone of distributed computing was laid in 1985 by Fischer, Lynch, and Paterson (FLP). Their proof demonstrated that in an asynchronous network, no deterministic consensus protocol can guarantee both safety (nothing bad happens) and liveness (something good eventually happens) in the presence of even a single unannounced process crash.</p>

<blockquote class="newspaper-quote">
"A distributed system is one in which the failure of a computer you didn't even know existed can render your own computer unusable."
<cite>— Leslie Lamport</cite>
</blockquote>

<h3>Deconstructing Raft: Decomposed Understandability</h3>
<p>Where Paxos merged leader election and log synchronization into an elegant but notoriously abstruse framework, Ongaro and Ousterhout’s Raft decomposed the problem into three orthogonal sub-problems:</p>
<ul>
  <li><strong>Leader Election:</strong> Heartbeat timeouts triggering candidate terms and randomized election timers to avoid split votes.</li>
  <li><strong>Log Replication:</strong> Strict append-only log propagation where the leader forces follower state machines to mirror its own.</li>
  <li><strong>Safety Invariance:</strong> Election restrictions guaranteeing that a newly elected leader already contains every entry committed in all prior terms.</li>
</ul>

<pre><code class="newspaper-code">// Raft AppendEntries RPC Structure
struct AppendEntriesRequest {
    term:          TermId,
    leader_id:     NodeId,
    prev_index:    LogIndex,
    prev_term:     TermId,
    entries:       Vec&lt;LogEntry&gt;,
    leader_commit: LogIndex,
}</code></pre>

<h3>The Byzantine Horizon</h3>
<p>When nodes are not merely subject to crash-stop failures but may actively deceive, collude, or exhibit arbitrary malicious behavior, simple majority quorums collapse. Solving Byzantine Fault Tolerance requires a supermajority of strictly greater than 3f + 1 nodes to tolerate f corrupt participants. As modern infrastructure spans untrusted sovereign jurisdictions, consensus protocols have shifted from crash-fault tolerance toward cryptographic threshold signatures and succinct verification.</p>
            `,
            draft: false,
            updatedAt: Date.now() - 3600000
        },
        {
            id: "dispatch_local_ai_02",
            title: "The Renaissance of Local Machine Intelligence: Quantized Weights on Bare Metal",
            category: "Artificial Intelligence",
            date: "2026-11-08",
            summary: "How post-training quantization, mixed-precision matrix arithmetic, and unified memory architectures reclaimed algorithmic autonomy from centralized server farms.",
            content: `
<p>The narrative that artificial intelligence must forever remain tethered to planetary-scale centralized cloud clusters is undergoing an abrupt and quiet demolition. Through breakthroughs in post-training quantization (AWQ, GPTQ, and EXL2) and kernel-level optimizations like llama.cpp and MLX, high-parameter neural models are running directly upon commodity silicon with astonishing throughput.</p>

<h3>The Mathematics of Weight Quantization</h3>
<p>A standard 70-billion-parameter neural network in full FP16 precision requires approximately 140 gigabytes of high-bandwidth VRAM just to reside in memory. By applying asymmetric 4-bit integer quantization with group scaling, the memory footprint drops to less than 38 gigabytes—well within reach of high-end personal workstations with unified memory.</p>

<p>The fundamental quantization function transforms a continuous floating point weight tensor <em>W</em> into discrete integers <em>Q</em>:</p>

<pre><code class="newspaper-code">// Uniform affine quantization mapping
Q = round( W / Scale ) + ZeroPoint
W_approx = (Q - ZeroPoint) * Scale</code></pre>

<h3>Zero-Latency Autonomy and Privacy</h3>
<p>When intelligence executes locally, three critical advantages emerge:</p>
<ul>
  <li><strong>Complete Sovereignty:</strong> No prompt, intellectual property, or personal thought is transmitted over the public wire to commercial telemetry collectors.</li>
  <li><strong>Predictable Real-Time Latency:</strong> Inference times are free from network jitter, HTTP connection handshakes, and multi-tenant queuing delays.</li>
  <li><strong>Indefinite Operational Life:</strong> The tool remains permanently functional regardless of API deprecations, company acquisitions, or policy shifts.</li>
</ul>
            `,
            draft: false,
            updatedAt: Date.now() - 7200000
        },
        {
            id: "dispatch_memory_safety_03",
            title: "Anatomy of Modern Memory Safety: Borrow Checkers, Capabilities, and Kernel Hygiene",
            category: "Security & Systems",
            date: "2026-11-06",
            summary: "Analyzing four decades of CVEs rooted in temporal and spatial memory corruption, and the technical mechanisms driving compile-time ownership semantics into core operating system kernels.",
            content: `
<p>For more than forty years, the software engineering discipline has grappled with an intractable malady: spatial and temporal memory corruption. Statistics compiled by Microsoft, Google, and the Cybersecurity and Infrastructure Security Agency consistently reveal that approximately seventy percent of all zero-day vulnerabilities in low-level codebases trace their lineage to manual memory management bugs.</p>

<h3>Spatial vs. Temporal Vulnerabilities</h3>
<p>Spatial memory errors occur when a pointer accesses data outside the memory boundaries allocated for its referenced object (buffer overflows, out-of-bounds indexing). Temporal memory errors, by contrast, occur when an access occurs outside the valid temporal lifetime of the memory allocation (use-after-free, double-free, and dangling pointer dereference).</p>

<blockquote class="newspaper-quote">
"A language that requires humans to manually track every temporal allocation across multi-threaded asynchronous boundaries is a language designed to produce security advisories."
</blockquote>

<h3>The Static Lifetime Invariant</h3>
<p>The breakthrough of modern borrow checking lies in shifting memory verification from dynamic runtime sanitizers to static compile-time proofs. By imposing two strict invariants:</p>
<ul>
  <li>Any resource may have any number of immutable references (<code>&amp;T</code>), OR</li>
  <li>Exactly one mutable reference (<code>&amp;mut T</code>), but never both simultaneously.</li>
</ul>
<p>With this affine type system, data races and dangling pointers become unrepresentable states in safe abstractions. The Linux kernel's phased integration of safe systems programming languages marks the beginning of an era where hardware control no longer necessitates memory hazard roulette.</p>
            `,
            draft: false,
            updatedAt: Date.now() - 14400000
        },
        {
            id: "dispatch_unix_minimalism_04",
            title: "The Lost Art of Unix Minimalism: Fifty Years of Doing One Thing Well",
            category: "Architecture",
            date: "2026-11-04",
            summary: "In praise of text streams, compositional pipelines, file descriptors, and why modern software layers have forgotten the virtues of radical simplicity.",
            content: `
<p>In 1978, Doug McIlroy articulated the Unix philosophy with crystalline economy: Make each program do one thing well. To do a new job, build afresh rather than complicate old programs by adding new 'features'. Expect the output of every program to become the input to another, as yet unknown, program. Write programs to handle text streams, because that is a universal interface.</p>

<h3>The Universality of the Byte Stream</h3>
<p>The genius of Ken Thompson and Dennis Ritchie was the realization that text—plain, unadorned ASCII bytes—is the supreme lingua franca of computing. A pipeline connecting <code>grep</code>, <code>sed</code>, <code>awk</code>, and <code>sort</code> requires no protocol negotiation, no binary schema serialization, and no centralized package registry.</p>

<pre><code class="newspaper-code">$ find . -name "*.log" -type f -print0 | \\
    xargs -0 grep -E "FATAL|PANIC" | \\
    awk -F':' '{print $1}' | \\
    sort | uniq -c | sort -nr | head -n 10</code></pre>

<h3>The Toll of Accidental Complexity</h3>
<p>In our contemporary ecosystem, a simple web utility often pulls twelve hundred transient dependencies totaling four hundred megabytes of node modules, only to render three static paragraphs. We must rekindle the aesthetic of the artisan who sculpts with clean, unencumbered primitives.</p>
            `,
            draft: false,
            updatedAt: Date.now() - 28800000
        },
        {
            id: "dispatch_zk_proofs_05",
            title: "Zero-Knowledge Proofs in Practice: Arithmetic Circuits and Succinct Verification",
            category: "Cryptography",
            date: "2026-11-01",
            summary: "How polynomial commitments, QAP reductions, and zk-SNARKs enable trustless verification of arbitrary computation without disclosing the underlying data.",
            content: `
<p>Imagine proving that you know the private key corresponding to a public address, or that you have executed a million steps of a financial ledger calculation without error, without revealing a single byte of your private inputs or requiring the verifier to re-run the calculation. This is the promise of Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (zk-SNARKs).</p>

<h3>From High-Level Code to Rank-1 Constraint Systems</h3>
<p>To prove an arbitrary computation, the algorithm is compiled through an algebraic pipeline:</p>
<ul>
  <li><strong>Computation:</strong> Expressed in a high-level circuit language (e.g., Circom, Noir).</li>
  <li><strong>R1CS:</strong> Converted into a Rank-1 Constraint System representing matrices <em>L</em>, <em>R</em>, and <em>O</em> such that <code>(L &middot; w) * (R &middot; w) = (O &middot; w)</code>.</li>
  <li><strong>Quadratic Arithmetic Programs (QAP):</strong> Interpolated into polynomials over a finite field.</li>
  <li><strong>Polynomial Commitment Schemes:</strong> KZG commitments or FRI (Fast Reed-Solomon IOP of Proximity) allowing a verifier to check evaluations at random evaluation points.</li>
</ul>

<p>The implications for decentralized identity, private credential verification, and scalable verifiable compute are nothing short of revolutionary.</p>
            `,
            draft: false,
            updatedAt: Date.now() - 43200000
        },
        {
            id: "dispatch_mechanical_sympathy_06",
            title: "Mechanical Sympathy: Designing Cache-Conscious Data Structures for Modern Silicon",
            category: "Architecture",
            date: "2026-10-28",
            summary: "L1/L2/L3 cache lines, memory latency walls, false sharing, and why data layout in physical memory dominates algorithm efficiency over asymptotic Big-O notation.",
            content: `
<p>In theoretical computer science, we are taught to analyze algorithms using asymptotic time complexity. An <em>O(N)</em> scan is deemed inherently superior to an <em>O(N log N)</em> sort. Yet in physical hardware, an algorithm with higher theoretical operations that respects CPU cache lines will routinely outperform a theoretically optimal algorithm that incurs constant pointer chases across DRAM.</p>

<h3>The Memory Latency Wall</h3>
<p>Modern CPU cores execute instructions in tenths of a nanosecond, while a trip to main memory takes between 50 and 100 nanoseconds—a relative gap equivalent to the difference between grabbing a pencil on your desk and walking three miles to fetch a book from a library.</p>

<pre><code class="newspaper-code">// Latency hierarchy comparison:
// L1 Cache Reference:   ~1.0 ns
// L2 Cache Reference:   ~3.5 ns
// L3 Cache Reference:  ~12.0 ns
// Main DRAM Access:   ~65.0 ns  (65x slower than L1!)</code></pre>

<h3>Structure of Arrays (SoA) vs. Array of Structures (AoS)</h3>
<p>When iterating through millions of game entities or analytical data records to update a single coordinate, an Array of Structures wastes 80% of each 64-byte cache line loading unused fields. Transitioning to Structure of Arrays guarantees that every loaded cache line is saturated with contiguous, relevant bytes, unlocking SIMD vectorization and prefetcher happiness.</p>
            `,
            draft: false,
            updatedAt: Date.now() - 86400000
        }
    ];

    // =========================================================================
    // CENTRALIZED ACCESSIBLE MODAL MANAGER
    // =========================================================================

    const ModalManager = (() => {
        let activeModal = null;
        let lastFocused = null;
        let activeOnClose = null;

        function getFocusable(container) {
            return Array.from(container.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null || window.getComputedStyle(el).position === "fixed");
        }

        function open(modal, options = {}) {
            if (!modal) return;
            if (activeModal && activeModal !== modal) {
                close(activeModal);
            }
            lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            activeModal = modal;
            activeOnClose = typeof options.onClose === "function" ? options.onClose : null;
            modal.classList.add("open");

            requestAnimationFrame(() => {
                if (options.initialFocus && typeof options.initialFocus.focus === "function") {
                    options.initialFocus.focus();
                } else {
                    const focusables = getFocusable(modal);
                    if (focusables.length > 0) focusables[0].focus();
                }
            });
        }

        function close(modal = activeModal) {
            const target = modal || activeModal;
            if (!target) return;

            target.classList.remove("open");
            const cb = activeModal === target ? activeOnClose : null;
            const prevFocus = activeModal === target ? lastFocused : null;

            if (activeModal === target) {
                activeModal = null;
                activeOnClose = null;
                lastFocused = null;
            }

            if (cb) cb();

            if (prevFocus && document.body.contains(prevFocus)) {
                try { prevFocus.focus(); } catch (_) {}
            }
        }

        document.addEventListener("click", (e) => {
            if (activeModal && e.target === activeModal) {
                close(activeModal);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (!activeModal) return;

            if (e.key === "Escape") {
                e.preventDefault();
                close(activeModal);
                return;
            }

            if (e.key === "Tab") {
                const focusables = getFocusable(activeModal);
                if (focusables.length === 0) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });

        return { open, close, isOpen: () => Boolean(activeModal) };
    })();

    // =========================================================================
    // INITIALIZATION & BOOT ORDER
    // =========================================================================

    async function initApp() {
        setupThemeToggle();
        setupLayoutToggle();
        setupMastheadNavigation();
        setupSearchListener();
        setupAdminModal();
        setupAdminDashboard();
        setupEditor();
        setupScrollController();
        setupKeyboardShortcuts();
        setupButtonRipples();

        // 1. Load cached posts immediately for 0ms first paint
        loadLocalPosts();
        renderCategoryFilters();
        renderFrontPage({ animate: true });
        updateAdminNavState();

        // 2. Initialize hash router AFTER posts are loaded
        setupHashRouter();

        // 3. Decrypt Cloudflare vault & synchronize live history
        try {
            updateSyncIndicator("syncing", "Connecting...");
            state.config = await global.SecurityVault.getConfig();
            await fetchCloudflareHistory();
        } catch (err) {
            console.warn("Cloudflare sync notice:", err.message);
            updateSyncIndicator("offline", "Local Mode");
        }
    }

    function isValidPostObject(p) {
        return Boolean(
            p && typeof p === "object" &&
            typeof p.id === "string" && p.id.trim() !== "" &&
            typeof p.title === "string" && p.title.trim() !== ""
        );
    }

    function sanitizePostsList(rawList) {
        if (!Array.isArray(rawList)) return [];
        const sanitizer = global.DispatchBloggerEditor && global.DispatchBloggerEditor.sanitizeHtml;
        return rawList.filter(isValidPostObject).map(p => ({
            id: String(p.id).trim(),
            title: String(p.title).trim(),
            category: String(p.category || "Architecture").trim(),
            date: String(p.date || getTodayLocalISO()).trim(),
            summary: String(p.summary || "").trim(),
            content: sanitizer ? sanitizer(String(p.content || "")) : String(p.content || ""),
            draft: Boolean(p.draft),
            updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now()
        }));
    }

    function loadLocalPosts() {
        try {
            const stored = localStorage.getItem("dispatch_posts_data");
            if (stored) {
                const parsed = JSON.parse(stored);
                const clean = sanitizePostsList(parsed);
                if (clean.length > 0) {
                    state.posts = clean;
                    return;
                }
            }
        } catch (_) {}

        state.posts = [...SEED_POSTS];
        saveLocalPosts();
    }

    function saveLocalPosts() {
        try {
            localStorage.setItem("dispatch_posts_data", JSON.stringify(state.posts));
        } catch (err) {
            console.error("Local storage error:", err);
        }
    }

    // =========================================================================
    // VIEW ROUTER (Cancelable Transition, Single Source of Truth)
    // =========================================================================

    function showView(viewName) {
        const prevView = state.currentView;
        state.currentView = viewName;

        if (viewTransitionTimer) {
            clearTimeout(viewTransitionTimer);
            viewTransitionTimer = null;
        }

        const frontPage = document.getElementById("frontPageView");
        const navBar = document.getElementById("archiveNavBar");
        const reader = document.getElementById("articleReaderView");
        const adminView = document.getElementById("adminSanctumView");
        const editorView = document.getElementById("bloggerEditorView");
        const progress = document.getElementById("readingProgressBar");
        const navHomeBtn = document.getElementById("navHomeBtn");

        const allViews = [frontPage, reader, adminView, editorView].filter(Boolean);
        allViews.forEach(el => el.classList.remove("view-exit"));

        const activeEl = allViews.find(el => !el.hidden && el.style.display !== "none");

        const applyView = () => {
            if (frontPage) {
                const show = viewName === "front";
                frontPage.hidden = !show;
                frontPage.style.display = show ? "block" : "none";
            }
            if (navBar) {
                const show = viewName === "front";
                navBar.hidden = !show;
                navBar.style.display = show ? "flex" : "none";
            }
            if (reader) {
                const show = viewName === "reader";
                reader.hidden = !show;
                reader.style.display = show ? "block" : "none";
            }
            if (adminView) {
                const show = viewName === "admin";
                adminView.hidden = !show;
                adminView.style.display = show ? "block" : "none";
            }
            if (editorView) {
                const show = viewName === "editor";
                editorView.hidden = !show;
                editorView.style.display = show ? "block" : "none";
            }
            if (progress) {
                const show = viewName === "reader";
                progress.style.display = show ? "block" : "none";
                if (!show) progress.style.width = "0%";
            }
            if (navHomeBtn) {
                navHomeBtn.classList.toggle("active", viewName === "front");
            }

            if (viewName !== "reader") {
                updatePageMeta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
            }

            const newEl = viewName === "front" ? frontPage
                : viewName === "reader" ? reader
                : viewName === "admin" ? adminView
                : editorView;

            if (newEl) {
                newEl.classList.remove("view-enter");
                void newEl.offsetWidth;
                newEl.classList.add("view-enter");
            }
        };

        const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!prefersReduced && activeEl && prevView !== viewName) {
            activeEl.classList.add("view-exit");
            viewTransitionTimer = setTimeout(() => {
                viewTransitionTimer = null;
                activeEl.classList.remove("view-exit");
                applyView();
            }, 130);
        } else {
            applyView();
        }
    }

    function updatePageMeta(title, description) {
        document.title = title;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && description) {
            metaDesc.setAttribute("content", description);
        }
    }

    // =========================================================================
    // CLOUDFLARE WORKER SYNCHRONIZATION
    // =========================================================================

    async function fetchCloudflareHistory() {
        if (!state.config || !state.config.host) return;

        const host = state.config.host;
        const room = state.config.room;

        try {
            const url = `https://${host}/history?room=${encodeURIComponent(room)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);

            const history = await res.json();
            if (Array.isArray(history) && history.length > 0) {
                for (let i = history.length - 1; i >= 0; i--) {
                    const msg = history[i];
                    if (!msg || !msg.text) continue;
                    try {
                        const parsed = JSON.parse(msg.text);
                        const remotePosts = sanitizePostsList(parsed);
                        if (remotePosts.length > 0) {
                            const prevSnapshot = JSON.stringify(state.posts.map(p => p.id + ":" + p.updatedAt));
                            const nextSnapshot = JSON.stringify(remotePosts.map(p => p.id + ":" + p.updatedAt));

                            state.posts = remotePosts;
                            saveLocalPosts();

                            if (prevSnapshot !== nextSnapshot) {
                                renderCategoryFilters();
                                renderFrontPage({ animate: state.currentView === "front" });
                                if (state.currentView === "admin") renderAdminPostsList();
                                if (state.currentView === "reader" && state.currentPostId) {
                                    const updated = state.posts.find(p => p.id === state.currentPostId);
                                    if (updated) renderArticleContent(updated);
                                }
                            }
                            updateSyncIndicator("synced", "Synced with Cloudflare");
                            return;
                        }
                    } catch (_) {
                        // Skip non-JSON or malformed messages without overwriting history
                    }
                }
                updateSyncIndicator("synced", "Synced with Cloudflare");
                return;
            }

            // Initialize genuinely empty room with current posts
            await broadcastPostsToCloudflare(state.posts);
        } catch (err) {
            console.warn("Cloudflare history fetch warning:", err.message);
            updateSyncIndicator("offline", "Offline Cache");
        }
    }

    function broadcastPostsToCloudflare(postsArray) {
        return new Promise((resolve) => {
            if (!state.config || !state.config.host) {
                updateSyncIndicator("offline", "Local Mode");
                resolve(false);
                return;
            }

            const host = state.config.host;
            const room = state.config.room;
            let settled = false;
            let sent = false;

            updateSyncIndicator("syncing", "Syncing to Cloudflare...");

            try {
                const wsUrl = `wss://${host}/?room=${encodeURIComponent(room)}`;
                const ws = new WebSocket(wsUrl);

                const timeoutId = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        try { ws.close(); } catch (_) {}
                        updateSyncIndicator("offline", "Sync timeout (Saved locally)");
                        resolve(false);
                    }
                }, 6000);

                ws.onopen = () => {
                    ws.send(JSON.stringify({
                        user: "__pad__",
                        text: JSON.stringify(postsArray),
                        time: Date.now()
                    }));
                    sent = true;

                    setTimeout(() => {
                        clearTimeout(timeoutId);
                        if (!settled) {
                            settled = true;
                            try { ws.close(1000, "Synced"); } catch (_) {}
                            updateSyncIndicator("synced", "Synced with Cloudflare");
                            resolve(true);
                        }
                    }, 600);
                };

                ws.onerror = () => {
                    clearTimeout(timeoutId);
                    if (!settled && !sent) {
                        settled = true;
                        updateSyncIndicator("offline", "Sync failed (Saved locally)");
                        resolve(false);
                    }
                };
            } catch (wsErr) {
                console.error("WebSocket initiation failed:", wsErr);
                updateSyncIndicator("offline", "Offline mode");
                resolve(false);
            }
        });
    }

    function updateSyncIndicator(status, text) {
        state.syncStatus = status;
        const indicators = document.querySelectorAll(".sync-badge");
        indicators.forEach(el => {
            el.className = "sync-badge status-" + status;
            el.innerHTML = `<span class="dot"></span> ${escapeHtml(text)}`;
        });
    }

    // =========================================================================
    // DYNAMIC CATEGORIES & FRONT PAGE RENDERING
    // =========================================================================

    function renderCategoryFilters() {
        const container = document.getElementById("categoryFilterList");
        if (!container) return;

        const isAdmin = global.SecurityVault.isAdminLoggedIn();
        const visiblePosts = state.posts.filter(p => !p.draft || isAdmin);
        state.activeCategory = "ALL";

        container.innerHTML = `<button type="button" class="category-filter-btn active" data-category="ALL">All Posts</button>`;

        const allBtn = container.querySelector('[data-category="ALL"]');
        if (allBtn) {
            allBtn.addEventListener("click", () => {
                state.activeCategory = "ALL";
                if (state.searchQuery) {
                    state.searchQuery = "";
                    const searchInput = document.getElementById("archiveSearchInput");
                    const clearBtn = document.getElementById("searchClearBtn");
                    if (searchInput) searchInput.value = "";
                    if (clearBtn) clearBtn.style.display = "none";
                }
                renderFrontPage({ animate: true });
            });
        }

        const countBadge = document.getElementById("archiveCountBadge");
        if (countBadge) {
            countBadge.textContent = visiblePosts.length;
        }
    }

    function getPostPlainText(post) {
        let cached = plainTextCache.get(post);
        if (cached === undefined) {
            cached = stripHtml(post.content || "");
            plainTextCache.set(post, cached);
        }
        return cached;
    }

    function getFilteredPosts() {
        const isAdmin = global.SecurityVault.isAdminLoggedIn();
        return state.posts.filter(post => {
            if (post.draft && !isAdmin) {
                return false;
            }

            if (state.activeCategory !== "ALL") {
                if ((post.category || "").toUpperCase() !== state.activeCategory.toUpperCase()) {
                    return false;
                }
            }

            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const titleMatch = (post.title || "").toLowerCase().includes(q);
                const summaryMatch = (post.summary || "").toLowerCase().includes(q);
                const categoryMatch = (post.category || "").toLowerCase().includes(q);
                if (titleMatch || summaryMatch || categoryMatch) return true;
                return getPostPlainText(post).toLowerCase().includes(q);
            }

            return true;
        });
    }

    function truncateAtWord(text, maxLen) {
        const clean = (text || "").replace(/\s+/g, " ").trim();
        if (clean.length <= maxLen) return clean;
        const slice = clean.slice(0, maxLen);
        const lastSpace = slice.lastIndexOf(" ");
        return (lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trim() + "…";
    }

    function renderFrontPage(options = {}) {
        const posts = getFilteredPosts();
        const columnsArea = document.getElementById("newspaperGrid");
        const indexList = document.getElementById("headlinesIndexList");
        const emptyState = document.getElementById("emptyArchiveNotice");

        if (!columnsArea || !indexList) return;

        const animateClass = options.animate ? " stagger-card" : "";

        if (posts.length === 0) {
            columnsArea.hidden = true;
            columnsArea.style.display = "none";
            indexList.hidden = true;
            indexList.style.display = "none";
            if (emptyState) {
                emptyState.hidden = false;
                emptyState.style.display = "block";
            }
            return;
        }

        if (emptyState) {
            emptyState.hidden = true;
            emptyState.style.display = "none";
        }

        if (state.layoutMode === "headlines") {
            columnsArea.hidden = true;
            columnsArea.style.display = "none";
            indexList.hidden = false;
            indexList.style.display = "flex";

            indexList.innerHTML = posts.map((post, idx) => `
                <article class="headline-index-row${animateClass}" style="--stagger-idx: ${Math.min(idx, 6)};">
                    <div class="index-row-main">
                        <h2 class="index-row-title">
                            <a href="#dispatch=${encodeURIComponent(post.id)}" class="card-headline-link" data-post-id="${escapeHtml(post.id)}">${escapeHtml(post.title)}</a>
                        </h2>
                        <div class="index-row-meta">
                            <span class="col-category">${escapeHtml(post.category)}</span>
                            <span class="meta-dot" aria-hidden="true">&middot;</span>
                            <span>${formatVintageDate(post.date)}</span>
                            <span class="meta-dot" aria-hidden="true">&middot;</span>
                            <span>${estimateReadTime(getPostPlainText(post))} read</span>
                            ${post.draft ? '<span class="draft-pill">DRAFT</span>' : ''}
                        </div>
                    </div>
                    <span class="index-row-arrow" aria-hidden="true">Read Dispatch &rarr;</span>
                </article>
            `).join("");

            bindPostCardClicks(indexList);
            return;
        }

        // Broadsheet Columns Layout (Uniform grid for all posts starting with latest)
        indexList.hidden = true;
        indexList.style.display = "none";
        columnsArea.hidden = false;
        columnsArea.style.display = "grid";

        columnsArea.innerHTML = posts.map((post, idx) => {
            const snippetText = post.summary || truncateAtWord(getPostPlainText(post), 155);
            return `
            <article class="newspaper-column-card${animateClass}" style="--stagger-idx: ${Math.min(idx, 6)};">
                <div>
                    <div class="col-meta-line">
                        <span class="col-category">${escapeHtml(post.category)}</span>
                        <span class="col-date">${formatVintageDate(post.date)}</span>
                    </div>
                    <h2 class="col-headline">
                        <a href="#dispatch=${encodeURIComponent(post.id)}" class="card-headline-link" data-post-id="${escapeHtml(post.id)}">${escapeHtml(post.title)}</a>
                    </h2>
                    <p class="col-snippet">
                        ${escapeHtml(snippetText)}
                    </p>
                </div>
                <div class="col-footer">
                    <span class="read-link" aria-hidden="true">Continue Reading &rarr;</span>
                    <span class="time-meta">${estimateReadTime(getPostPlainText(post))} ${post.draft ? '&middot; DRAFT' : ''}</span>
                </div>
            </article>
        `;
        }).join("");
        bindPostCardClicks(columnsArea);
    }

    function bindPostCardClicks(container) {
        container.querySelectorAll("a.card-headline-link[data-post-id]").forEach(link => {
            link.addEventListener("click", (e) => {
                // Allow Ctrl/Cmd/middle click to open normally in new tab; handle standard click cleanly
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                openArticle(link.getAttribute("data-post-id"));
            });
        });
    }

    // =========================================================================
    // ARTICLE READING VIEW (Sanitized Body, Progress Bar, Auto-TOC, Copy, Pagination)
    // =========================================================================

    function openArticle(postId) {
        const post = state.posts.find(p => p.id === postId);
        if (!post) return;

        if (post.draft && !global.SecurityVault.isAdminLoggedIn()) {
            showToast("This draft dispatch is restricted to the Admin Sanctum.", "error");
            return;
        }

        state.currentPostId = postId;
        const targetHash = "#dispatch=" + encodeURIComponent(postId);
        if (window.location.hash !== targetHash) {
            window.location.hash = targetHash;
        }

        showView("reader");
        renderArticleContent(post);
        updatePageMeta(
            `${post.title} — The Silicon Dispatch`,
            post.summary || truncateAtWord(getPostPlainText(post), 155) || DEFAULT_DESCRIPTION
        );
        scrollToTop();
    }

    function closeArticle() {
        state.currentPostId = null;
        if (window.location.hash && window.location.hash !== "#admin") {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
        showView("front");
        scrollToTop();
    }

    function renderArticleContent(post) {
        const reader = document.getElementById("articleReaderView");
        if (!reader) return;

        const sanitizer = global.DispatchBloggerEditor && global.DispatchBloggerEditor.sanitizeHtml;
        const safeMarkup = sanitizer ? sanitizer(post.content || "") : (post.content || "");

        const tempContainer = document.createElement("div");
        tempContainer.innerHTML = safeMarkup;

        const firstP = tempContainer.querySelector("p");
        if (firstP && !firstP.classList.contains("drop-cap")) {
            firstP.classList.add("drop-cap");
        }

        // Build automatic Table of Contents from h2/h3 headings
        const headings = Array.from(tempContainer.querySelectorAll("h2, h3"));
        let tocHtml = "";
        if (headings.length >= 2) {
            const tocItems = headings.map((h, i) => {
                const secId = `sec_${i}_${post.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
                h.id = secId;
                return `<li><a href="#${secId}" data-scroll-target="${secId}">${escapeHtml(h.textContent)}</a></li>`;
            }).join("");

            tocHtml = `
                <details class="article-toc-box">
                    <summary>
                        <span>In This Dispatch</span>
                        <span class="toc-count-badge">${headings.length} Sections <span aria-hidden="true">&#9662;</span></span>
                    </summary>
                    <ol class="article-toc-list">${tocItems}</ol>
                </details>
            `;
        }

        // Wrap <table> elements in a scrollable container for mobile responsiveness
        tempContainer.querySelectorAll("table").forEach(table => {
            if (table.parentNode && table.parentNode.classList && table.parentNode.classList.contains("table-scroll-wrap")) {
                return;
            }
            const wrapper = document.createElement("div");
            wrapper.className = "table-scroll-wrap";
            wrapper.setAttribute("tabindex", "0");
            wrapper.setAttribute("role", "region");
            wrapper.setAttribute("aria-label", "Scrollable data table");
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });

        // Wrap <pre> blocks for Copy-to-Clipboard buttons
        tempContainer.querySelectorAll("pre").forEach(pre => {
            const wrapper = document.createElement("div");
            wrapper.className = "code-block-wrapper";
            const copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "btn-copy-code";
            copyBtn.textContent = "Copy";
            copyBtn.setAttribute("aria-label", "Copy code block to clipboard");
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(copyBtn);
            wrapper.appendChild(pre);
        });

        // Compute Prev / Next Dispatches among visible posts
        const visiblePosts = getFilteredPosts();
        const currentIdx = visiblePosts.findIndex(p => p.id === post.id);
        const prevPost = currentIdx > 0 ? visiblePosts[currentIdx - 1] : null;
        const nextPost = (currentIdx >= 0 && currentIdx < visiblePosts.length - 1) ? visiblePosts[currentIdx + 1] : null;

        reader.innerHTML = `
            <div class="reader-container">
                <nav class="reader-nav-bar" aria-label="Article reading controls">
                    <button type="button" class="btn-return" id="btnReaderBackFront">
                        &larr; Front Page
                    </button>
                    <div class="reader-tools">
                        <span class="tool-label">Print Size:</span>
                        <button type="button" class="btn-tool" id="btnFontSmaller" title="Decrease font size" aria-label="Decrease reading font size">A-</button>
                        <button type="button" class="btn-tool" id="btnFontLarger" title="Increase font size" aria-label="Increase reading font size">A+</button>
                        <button type="button" class="btn-tool" id="btnCopyDispatchLink" title="Copy direct link" aria-label="Copy link to dispatch">
                            ${ICON_LINK} <span>Share</span>
                        </button>
                        <button type="button" class="btn-tool" id="btnPrintBroadside" title="Print Broadside" aria-label="Print article">
                            ${ICON_PRINT} <span>Print</span>
                        </button>
                    </div>
                </nav>

                <header class="reader-header">
                    <div class="reader-kicker">
                        <span class="category-pill">${escapeHtml(post.category)}</span>
                        <span class="meta-pair">
                            <span>${formatVintageDate(post.date)}</span>
                            <span aria-hidden="true">&middot;</span>
                            <span class="read-estimate">${estimateReadTime(getPostPlainText(post))} read</span>
                        </span>
                        ${post.draft ? '<span class="draft-pill">DRAFT</span>' : ''}
                    </div>

                    <h1 class="reader-title">${escapeHtml(post.title)}</h1>

                    ${post.summary ? `<p class="reader-subheadline">${escapeHtml(post.summary)}</p>` : ''}

                    <div class="reader-author-rule">
                        <span class="rule-line"></span>
                        <span class="rule-ornament" aria-hidden="true">&#10070;</span>
                        <span class="rule-line"></span>
                    </div>
                </header>

                ${tocHtml}

                <article class="reader-body" id="articleBody" style="font-size: ${currentFontSizePx}px;">
                    ${tempContainer.innerHTML}
                </article>

                <footer class="reader-footer">
                    <div class="reader-pagination">
                        ${prevPost ? `
                            <button type="button" class="btn-page-nav prev" data-nav-post="${escapeHtml(prevPost.id)}">
                                <small>&larr; Previous Dispatch</small>
                                <span>${escapeHtml(prevPost.title)}</span>
                            </button>
                        ` : '<div></div>'}

                        <button type="button" class="btn-return-bottom" id="btnReaderBackBottom">
                            &uarr; Front Page
                        </button>

                        ${nextPost ? `
                            <button type="button" class="btn-page-nav next" data-nav-post="${escapeHtml(nextPost.id)}">
                                <small>Next Dispatch &rarr;</small>
                                <span>${escapeHtml(nextPost.title)}</span>
                            </button>
                        ` : '<div></div>'}
                    </div>

                    <div class="vintage-colophon">
                        <span class="ornament" aria-hidden="true">&#10086; &#10022; &#10086;</span>
                        <p>The Silicon Dispatch &bull; Pure Text Computing Archive</p>
                    </div>
                </footer>
            </div>
        `;

        const btnBackTop = document.getElementById("btnReaderBackFront");
        const btnBackBot = document.getElementById("btnReaderBackBottom");
        if (btnBackTop) btnBackTop.addEventListener("click", closeArticle);
        if (btnBackBot) btnBackBot.addEventListener("click", closeArticle);

        const btnSmaller = document.getElementById("btnFontSmaller");
        const btnLarger = document.getElementById("btnFontLarger");
        const btnCopyLink = document.getElementById("btnCopyDispatchLink");
        const btnPrint = document.getElementById("btnPrintBroadside");
        if (btnSmaller) btnSmaller.addEventListener("click", () => adjustFontSize(-1));
        if (btnLarger) btnLarger.addEventListener("click", () => adjustFontSize(1));
        if (btnPrint) btnPrint.addEventListener("click", () => window.print());
        if (btnCopyLink) {
            btnCopyLink.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    showToast("Dispatch link copied to clipboard.", "success");
                } catch (_) {
                    showToast("Clipboard permission unavailable.", "error");
                }
            });
        }

        reader.querySelectorAll("[data-scroll-target]").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const targetEl = document.getElementById(link.getAttribute("data-scroll-target"));
                if (targetEl) targetEl.scrollIntoView({ behavior: "smooth" });
            });
        });

        reader.querySelectorAll(".btn-copy-code").forEach(btn => {
            btn.addEventListener("click", async () => {
                const wrapper = btn.closest(".code-block-wrapper");
                const codeEl = wrapper ? wrapper.querySelector("code") : null;
                if (!codeEl) return;
                try {
                    await navigator.clipboard.writeText(codeEl.textContent);
                    btn.textContent = "Copied";
                    btn.classList.add("copied");
                    setTimeout(() => {
                        btn.textContent = "Copy";
                        btn.classList.remove("copied");
                    }, 1800);
                } catch (_) {
                    showToast("Clipboard permission unavailable.", "error");
                }
            });
        });

        reader.querySelectorAll("[data-nav-post]").forEach(btn => {
            btn.addEventListener("click", () => {
                openArticle(btn.getAttribute("data-nav-post"));
            });
        });
    }

    function adjustFontSize(delta) {
        currentFontSizePx = Math.max(14, Math.min(24, currentFontSizePx + delta * 2));
        const body = document.getElementById("articleBody");
        if (body) {
            body.style.fontSize = currentFontSizePx + "px";
        }
    }

    // =========================================================================
    // CONSOLIDATED SCROLL CONTROLLER (Reading Bar + Back to Top)
    // =========================================================================

    function scrollToTop() {
        const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
    }

    function setupScrollController() {
        backToTopBtn = document.createElement("button");
        backToTopBtn.type = "button";
        backToTopBtn.className = "btn-back-to-top";
        backToTopBtn.innerHTML = '<span aria-hidden="true">&#8593;</span>';
        backToTopBtn.title = "Back to top";
        backToTopBtn.setAttribute("aria-label", "Scroll to top");
        document.body.appendChild(backToTopBtn);

        backToTopBtn.addEventListener("click", scrollToTop);

        let ticking = false;
        window.addEventListener("scroll", () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const scrollTop = window.scrollY || document.documentElement.scrollTop;

                if (backToTopBtn) {
                    backToTopBtn.classList.toggle("visible", scrollTop > 400);
                }

                if (state.currentView === "reader") {
                    const bar = document.getElementById("readingProgressBar");
                    if (bar) {
                        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                        const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
                        bar.style.width = pct + "%";
                    }
                }
                ticking = false;
            });
        }, { passive: true });
    }

    // =========================================================================
    // HASH ROUTER
    // =========================================================================

    function setupHashRouter() {
        window.addEventListener("hashchange", handleHash);
        handleHash();
    }

    function handleHash() {
        const hash = window.location.hash;
        if (hash.startsWith("#dispatch=")) {
            const id = decodeURIComponent(hash.replace("#dispatch=", ""));
            const found = state.posts.find(p => p.id === id);
            if (found) {
                if (state.currentView === "admin" || state.currentView === "editor") {
                    global.SecurityVault.destroySession();
                    updateAdminNavState();
                }
                openArticle(id);
            } else {
                showView("front");
            }
        } else if (hash === "#admin") {
            if (global.SecurityVault.isAdminLoggedIn()) {
                openAdminSanctum();
            } else {
                showView("front");
                openLoginModal();
            }
        } else {
            if (state.currentView === "admin" || state.currentView === "editor") {
                if (global.DispatchBloggerEditor && global.DispatchBloggerEditor.hasUnsavedChanges()) {
                    global.DispatchBloggerEditor.resetDirty();
                }
                closeAdminSanctum();
            } else if (state.currentView === "reader") {
                state.currentPostId = null;
                showView("front");
            }
        }
    }

    // =========================================================================
    // NAVIGATION, LAYOUT TOGGLE & SEARCH
    // =========================================================================

    function confirmDiscardEditorIfNeeded(proceedFn) {
        if (
            state.currentView === "editor" &&
            global.DispatchBloggerEditor &&
            global.DispatchBloggerEditor.hasUnsavedChanges()
        ) {
            showConfirmModal(
                "You have unsaved editorial changes in the current dispatch. Discard edits and leave?",
                () => {
                    global.DispatchBloggerEditor.resetDirty();
                    proceedFn();
                }
            );
            return;
        }
        proceedFn();
    }

    function setupMastheadNavigation() {
        const homeLink = document.getElementById("mastheadHomeLink");
        const navHomeBtn = document.getElementById("navHomeBtn");

        const goHome = (e) => {
            if (e) e.preventDefault();
            confirmDiscardEditorIfNeeded(() => {
                if (state.currentView === "admin" || state.currentView === "editor" || global.SecurityVault.isAdminLoggedIn()) {
                    closeAdminSanctum();
                    scrollToTop();
                    showToast("Returned to Front Page & signed out of Sanctum.", "info");
                } else {
                    closeArticle();
                }
            });
        };

        if (homeLink) homeLink.addEventListener("click", goHome);
        if (navHomeBtn) navHomeBtn.addEventListener("click", goHome);
    }

    function setupLayoutToggle() {
        const btnBroadsheet = document.getElementById("btnLayoutBroadsheet");
        const btnHeadlines = document.getElementById("btnLayoutHeadlines");
        const savedLayout = localStorage.getItem("dispatch_layout_mode");

        if (savedLayout === "headlines") {
            state.layoutMode = "headlines";
        }

        const updateButtons = () => {
            const isBroadsheet = state.layoutMode === "broadsheet";
            if (btnBroadsheet) {
                btnBroadsheet.classList.toggle("active", isBroadsheet);
                btnBroadsheet.setAttribute("aria-pressed", String(isBroadsheet));
            }
            if (btnHeadlines) {
                btnHeadlines.classList.toggle("active", !isBroadsheet);
                btnHeadlines.setAttribute("aria-pressed", String(!isBroadsheet));
            }
        };
        updateButtons();

        if (btnBroadsheet) {
            btnBroadsheet.addEventListener("click", () => {
                if (state.layoutMode === "broadsheet") return;
                state.layoutMode = "broadsheet";
                localStorage.setItem("dispatch_layout_mode", "broadsheet");
                updateButtons();
                renderFrontPage({ animate: true });
            });
        }

        if (btnHeadlines) {
            btnHeadlines.addEventListener("click", () => {
                if (state.layoutMode === "headlines") return;
                state.layoutMode = "headlines";
                localStorage.setItem("dispatch_layout_mode", "headlines");
                updateButtons();
                renderFrontPage({ animate: true });
            });
        }
    }

    function setupSearchListener() {
        const searchInput = document.getElementById("archiveSearchInput");
        const clearBtn = document.getElementById("searchClearBtn");
        const resetBtn = document.getElementById("btnResetFilters");

        let searchDebounce = null;
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                const val = e.target.value.trim();
                if (clearBtn) clearBtn.style.display = val ? "block" : "none";
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    state.searchQuery = val;
                    renderFrontPage();
                }, 60);
            });

            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    if (searchInput.value) {
                        searchInput.value = "";
                        state.searchQuery = "";
                        if (clearBtn) clearBtn.style.display = "none";
                        renderFrontPage();
                    } else {
                        searchInput.blur();
                    }
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                if (searchInput) searchInput.value = "";
                state.searchQuery = "";
                clearBtn.style.display = "none";
                renderFrontPage();
                if (searchInput) searchInput.focus();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                state.activeCategory = "ALL";
                state.searchQuery = "";
                if (searchInput) searchInput.value = "";
                if (clearBtn) clearBtn.style.display = "none";
                renderCategoryFilters();
                renderFrontPage({ animate: true });
            });
        }
    }

    // =========================================================================
    // DAY / MIDNIGHT EDITION TOGGLE
    // =========================================================================

    function setupThemeToggle() {
        const toggleBtn = document.getElementById("themeToggleBtn");
        const savedTheme = localStorage.getItem("dispatch_newspaper_theme");

        const syncThemeUI = (isMidnight) => {
            if (toggleBtn) {
                toggleBtn.innerHTML = isMidnight ? `${ICON_SUN} <span>Daylight</span>` : `${ICON_MOON} <span>Midnight</span>`;
                toggleBtn.setAttribute("aria-pressed", String(isMidnight));
            }
            const metaTheme = document.querySelector('meta[name="theme-color"]');
            if (metaTheme) metaTheme.setAttribute("content", isMidnight ? "#151413" : "#f5f1e8");
        };

        if (savedTheme === "midnight") {
            document.body.classList.add("midnight-edition");
            syncThemeUI(true);
        } else {
            syncThemeUI(false);
        }

        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                document.body.classList.toggle("midnight-edition");
                const isMidnight = document.body.classList.contains("midnight-edition");
                localStorage.setItem("dispatch_newspaper_theme", isMidnight ? "midnight" : "daylight");
                syncThemeUI(isMidnight);
            });
        }
    }

    // =========================================================================
    // ADMIN SANCTUM AUTHENTICATION & MANAGEMENT (AUTO-LOGOUT ON EXIT TO FRONT)
    // =========================================================================

    function openLoginModal() {
        const modal = document.getElementById("adminLoginModal");
        const errorAlert = document.getElementById("loginErrorAlert");
        const userField = document.getElementById("adminUsername");
        const passField = document.getElementById("adminPassword");

        if (errorAlert) errorAlert.style.display = "none";
        if (passField) passField.value = "";

        ModalManager.open(modal, {
            initialFocus: (userField && userField.value.trim()) ? passField : userField,
            onClose: () => {
                if (errorAlert) errorAlert.style.display = "none";
                if (window.location.hash === "#admin" && !global.SecurityVault.isAdminLoggedIn()) {
                    history.pushState("", document.title, window.location.pathname + window.location.search);
                }
            }
        });
    }

    function setupAdminModal() {
        const adminBtn = document.getElementById("adminSanctumBtn");
        const modal = document.getElementById("adminLoginModal");
        const closeBtn = document.getElementById("closeLoginModalBtn");
        const form = document.getElementById("adminLoginForm");
        const errorAlert = document.getElementById("loginErrorAlert");

        if (adminBtn) {
            adminBtn.addEventListener("click", () => {
                confirmDiscardEditorIfNeeded(() => {
                    if (global.SecurityVault.isAdminLoggedIn()) {
                        openAdminSanctum();
                    } else {
                        openLoginModal();
                    }
                });
            });
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", () => ModalManager.close(modal));
        }

        if (form) {
            form.addEventListener("submit", async (e) => {
                e.preventDefault();

                const secsLeft = global.SecurityVault.getLockoutRemainingSeconds();
                if (secsLeft > 0) {
                    if (errorAlert) {
                        errorAlert.textContent = `Too many failed attempts. Please wait ${secsLeft}s before retrying.`;
                        errorAlert.style.display = "block";
                    }
                    return;
                }

                const username = document.getElementById("adminUsername").value;
                const password = document.getElementById("adminPassword").value;
                const submitBtn = form.querySelector("button[type='submit']");

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Verifying Vault...";
                }

                const isValid = await global.SecurityVault.verifyAdmin(username, password);

                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Unlock Sanctum";
                }

                if (isValid) {
                    global.SecurityVault.clearLockout();
                    global.SecurityVault.createSession(username);
                    ModalManager.close(modal);
                    form.reset();
                    showToast("Editorial Sanctum unlocked.", "success");
                    openAdminSanctum();
                } else {
                    const lockoutSecs = global.SecurityVault.recordFailedAttempt();
                    if (errorAlert) {
                        errorAlert.textContent = lockoutSecs > 0
                            ? `Too many failed attempts. Locked for ${lockoutSecs}s.`
                            : "Authentication rejected: Invalid cryptographic credentials.";
                        errorAlert.style.display = "block";
                    }
                }
            });
        }
    }

    async function refreshDefaultAuthBanner() {
        const banner = document.getElementById("defaultAuthWarning");
        if (!banner) return;
        const isDefault = await global.SecurityVault.isUsingDefaultCredentials();
        banner.hidden = !isDefault;
    }

    function openAdminSanctum() {
        if (!global.SecurityVault.isAdminLoggedIn()) {
            openLoginModal();
            return;
        }

        if (window.location.hash !== "#admin") {
            history.pushState({ view: "admin" }, document.title, "#admin");
        }

        showView("admin");
        renderAdminPostsList();
        updateAdminNavState();
        refreshDefaultAuthBanner();
        scrollToTop();
    }

    function closeAdminSanctum() {
        // Auto-logout: destroy admin session whenever returning to front page
        global.SecurityVault.destroySession();

        if (window.location.hash === "#admin") {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        }
        showView("front");
        updateAdminNavState();
        renderCategoryFilters();
        renderFrontPage({ animate: true });
    }

    function updateAdminNavState() {
        const adminBtn = document.getElementById("adminSanctumBtn");
        const isLoggedIn = global.SecurityVault.isAdminLoggedIn();

        if (adminBtn) {
            adminBtn.innerHTML = isLoggedIn
                ? `${ICON_UNLOCK} <span>Sanctum</span>`
                : `${ICON_LOCK} <span>Admin</span>`;
            adminBtn.classList.toggle("logged-in", isLoggedIn);
            adminBtn.title = isLoggedIn ? "Editorial Sanctum Open" : "Unlock Editorial Sanctum";
        }
    }

    function setupAdminDashboard() {
        const btnNewPost = document.getElementById("btnNewDispatch");
        const btnExitSanctum = document.getElementById("btnExitSanctum");
        const btnLogout = document.getElementById("btnLogoutSanctum");
        const btnSettings = document.getElementById("btnSanctumSettings");
        const btnBannerSettings = document.getElementById("btnOpenSettingsFromBanner");
        const btnForceSync = document.getElementById("btnForceSync");
        const adminFilter = document.getElementById("adminFilterInput");
        const settingsModal = document.getElementById("sanctumSettingsModal");
        const closeSettingsBtn = document.getElementById("closeSettingsModalBtn");
        const settingsForm = document.getElementById("settingsForm");
        const settingsErr = document.getElementById("settingsErrorAlert");
        const btnResetDefaults = document.getElementById("btnResetVaultDefaults");

        if (btnNewPost) {
            btnNewPost.addEventListener("click", () => openBloggerEditor(null));
        }

        if (btnExitSanctum) {
            btnExitSanctum.addEventListener("click", () => {
                closeAdminSanctum();
                scrollToTop();
                showToast("Signed out on return to Front Page.", "info");
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener("click", () => {
                closeAdminSanctum();
                scrollToTop();
                showToast("Safely logged out of the Editorial Sanctum.", "info");
            });
        }

        if (btnForceSync) {
            btnForceSync.addEventListener("click", async () => {
                if (!state.config) {
                    try { state.config = await global.SecurityVault.getConfig(); } catch (_) {}
                }
                const ok = await broadcastPostsToCloudflare(state.posts);
                showToast(ok ? "All dispatches synced to Cloudflare!" : "Cloudflare unreachable right now.", ok ? "success" : "error");
            });
        }

        if (adminFilter) {
            adminFilter.addEventListener("input", (e) => {
                state.adminSearchQuery = e.target.value.trim().toLowerCase();
                renderAdminPostsList();
            });
        }

        const openSettings = async () => {
            if (!settingsModal) return;
            const cfg = await global.SecurityVault.getConfig();
            const roomInput = document.getElementById("settingCloudflareRoom");
            const userInput = document.getElementById("settingNewUsername");
            const passInput = document.getElementById("settingNewPassword");
            if (settingsErr) settingsErr.style.display = "none";
            if (roomInput) roomInput.value = cfg.room;
            if (userInput) userInput.value = cfg.auth.username;
            if (passInput) passInput.value = "";
            ModalManager.open(settingsModal, { initialFocus: roomInput });
        };

        if (btnSettings) btnSettings.addEventListener("click", openSettings);
        if (btnBannerSettings) btnBannerSettings.addEventListener("click", openSettings);

        if (closeSettingsBtn && settingsModal) {
            closeSettingsBtn.addEventListener("click", () => ModalManager.close(settingsModal));
        }

        if (settingsForm) {
            settingsForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (settingsErr) settingsErr.style.display = "none";

                const cfg = await global.SecurityVault.getConfig();
                const newRoom = document.getElementById("settingCloudflareRoom").value.trim();
                const newUser = document.getElementById("settingNewUsername").value.trim();
                const newPass = document.getElementById("settingNewPassword").value;

                if (!newRoom) {
                    if (settingsErr) {
                        settingsErr.textContent = "Cloudflare Storage Room cannot be empty.";
                        settingsErr.style.display = "block";
                    }
                    return;
                }

                const usernameChanged = newUser && newUser !== cfg.auth.username;
                if (usernameChanged && !newPass) {
                    if (settingsErr) {
                        settingsErr.textContent = "Please provide a passphrase when changing the admin username.";
                        settingsErr.style.display = "block";
                    }
                    return;
                }

                const roomChanged = newRoom !== cfg.room;
                if (roomChanged) {
                    global.SecurityVault.setCustomRoom(newRoom);
                    if (state.config) state.config.room = newRoom;
                }

                if (newUser && newPass) {
                    await global.SecurityVault.updateCredentials(newUser, newPass);
                    refreshDefaultAuthBanner();
                    showToast(roomChanged ? "Credentials and Cloudflare room updated." : "Admin credentials updated.", "success");
                } else if (roomChanged) {
                    showToast("Cloudflare room updated.", "success");
                } else {
                    showToast("No configuration changes detected.", "info");
                }

                ModalManager.close(settingsModal);
                if (roomChanged) fetchCloudflareHistory();
            });
        }

        if (btnResetDefaults && settingsModal) {
            btnResetDefaults.addEventListener("click", async () => {
                global.SecurityVault.resetCustomSettings();
                state.config = await global.SecurityVault.getConfig();
                refreshDefaultAuthBanner();
                ModalManager.close(settingsModal);
                showToast("Settings restored to encrypted vault defaults.", "info");
                fetchCloudflareHistory();
            });
        }

        // Export & Import JSON backups (Blob download, schema validated)
        const btnExport = document.getElementById("btnExportBackup");
        const btnImport = document.getElementById("btnImportBackup");
        const fileInput = document.getElementById("importFileInput");

        if (btnExport) {
            btnExport.addEventListener("click", () => {
                const payload = JSON.stringify(state.posts, null, 2);
                const blob = new Blob([payload], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const downloadAnchor = document.createElement("a");
                downloadAnchor.href = url;
                downloadAnchor.download = `dispatch_backup_${getTodayLocalISO()}.json`;
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showToast("JSON backup downloaded.", "success");
            });
        }

        if (btnImport && fileInput) {
            btnImport.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const parsed = JSON.parse(evt.target.result);
                        const cleaned = sanitizePostsList(parsed);
                        if (cleaned.length > 0) {
                            state.posts = cleaned;
                            saveLocalPosts();
                            broadcastPostsToCloudflare(state.posts);
                            renderAdminPostsList();
                            renderCategoryFilters();
                            renderFrontPage();
                            showToast(`Restored ${cleaned.length} dispatches from backup.`, "success");
                        } else {
                            showToast("Invalid or empty backup JSON structure.", "error");
                        }
                    } catch (parseErr) {
                        showToast("JSON parse error: " + parseErr.message, "error");
                    } finally {
                        fileInput.value = "";
                    }
                };
                reader.readAsText(file);
            });
        }
    }

    function renderAdminPostsList() {
        const tbody = document.getElementById("adminPostsTableBody");
        const statsEl = document.getElementById("adminPostStats");
        if (!tbody) return;

        const filtered = state.posts.filter(post => {
            if (!state.adminSearchQuery) return true;
            return (
                (post.title || "").toLowerCase().includes(state.adminSearchQuery) ||
                (post.category || "").toLowerCase().includes(state.adminSearchQuery)
            );
        });

        const pubCount = state.posts.filter(p => !p.draft).length;
        const draftCount = state.posts.length - pubCount;
        if (statsEl) {
            statsEl.textContent = `${pubCount} Published • ${draftCount} Drafts`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--ink-muted);">No dispatches match your filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(post => `
            <tr>
                <td data-label="Headline"><strong>${escapeHtml(post.title)}</strong></td>
                <td data-label="Category"><span class="badge-cat">${escapeHtml(post.category)}</span></td>
                <td data-label="Date">${formatVintageDate(post.date)}</td>
                <td data-label="Status">
                    <span class="status-indicator ${post.draft ? 'draft' : 'published'}">
                        ${post.draft ? 'Draft' : 'Published'}
                    </span>
                </td>
                <td class="action-cell" data-label="Actions">
                    <button type="button" class="btn-action edit" data-admin-action="edit" data-id="${escapeHtml(post.id)}" title="Edit in Blogger view">${ICON_EDIT} <span>Edit</span></button>
                    <button type="button" class="btn-action duplicate" data-admin-action="copy" data-id="${escapeHtml(post.id)}" title="Duplicate">${ICON_COPY} <span>Copy</span></button>
                    <button type="button" class="btn-action delete" data-admin-action="delete" data-id="${escapeHtml(post.id)}" title="Delete">${ICON_TRASH} <span>Delete</span></button>
                </td>
            </tr>
        `).join("");

        tbody.querySelectorAll("[data-admin-action]").forEach(btn => {
            btn.addEventListener("click", () => {
                const action = btn.getAttribute("data-admin-action");
                const id = btn.getAttribute("data-id");
                if (action === "edit") editPost(id);
                else if (action === "copy") duplicatePost(id);
                else if (action === "delete") deletePost(id);
            });
        });
    }

    function setupEditor() {
        const domRefs = {
            editorContainer: document.getElementById("bloggerEditorView"),
            viewSwitchBtn: document.getElementById("bloggerViewSwitchBtn"),
            viewMenu: document.getElementById("bloggerViewMenu"),
            optComposeView: document.getElementById("optComposeView"),
            optHtmlView: document.getElementById("optHtmlView"),
            currentModeLabel: document.getElementById("currentViewModeLabel"),
            composeToolbar: document.getElementById("composeToolbar"),
            htmlToolbar: document.getElementById("htmlToolbar"),
            composeContainer: document.getElementById("composeViewContainer"),
            htmlContainer: document.getElementById("htmlViewContainer"),
            composeEditor: document.getElementById("composeEditorArea"),
            htmlEditor: document.getElementById("htmlSourceArea"),
            headingSelect: document.getElementById("formatHeadingSelect"),
            foreColorPicker: document.getElementById("textColorPicker"),
            btnFormatHtml: document.getElementById("btnBeautifyHtml"),
            btnPublish: document.getElementById("btnPublishDispatch"),
            btnDraft: document.getElementById("btnSaveDraft"),
            inputTitle: document.getElementById("postTitleInput"),
            inputCategory: document.getElementById("postCategoryInput"),
            inputSummary: document.getElementById("postSummaryInput"),
            inputDate: document.getElementById("postDateInput"),
            editorHeading: document.getElementById("editorHeaderTitle"),
            editorStatusBadge: document.getElementById("editorStatusBadge")
        };

        global.DispatchBloggerEditor.init(domRefs, {
            onSave: (savedPost) => {
                const existingIndex = state.posts.findIndex(p => p.id === savedPost.id);
                if (existingIndex >= 0) {
                    state.posts[existingIndex] = savedPost;
                } else {
                    state.posts.unshift(savedPost);
                }

                saveLocalPosts();
                broadcastPostsToCloudflare(state.posts);
                renderAdminPostsList();
                renderCategoryFilters();
                renderFrontPage();

                showToast(
                    savedPost.draft
                        ? "Dispatch saved as draft."
                        : "Dispatch published & synced to Cloudflare!",
                    "success"
                );
            },
            onToast: showToast,
            modalManager: ModalManager
        });

        const btnCloseEditor = document.getElementById("btnCloseEditor");
        if (btnCloseEditor) {
            btnCloseEditor.addEventListener("click", () => {
                confirmDiscardEditorIfNeeded(() => {
                    openAdminSanctum();
                });
            });
        }
    }

    function openBloggerEditor(postId) {
        if (!global.SecurityVault.isAdminLoggedIn()) {
            openLoginModal();
            return;
        }

        showView("editor");
        const post = postId ? state.posts.find(p => p.id === postId) : null;
        global.DispatchBloggerEditor.loadPost(post);
        scrollToTop();
    }

    function editPost(postId) {
        openBloggerEditor(postId);
    }

    function duplicatePost(postId) {
        const post = state.posts.find(p => p.id === postId);
        if (!post) return;

        const copy = {
            ...post,
            id: "dispatch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            title: post.title + " (Copy)",
            date: getTodayLocalISO(),
            draft: true,
            updatedAt: Date.now()
        };

        state.posts.unshift(copy);
        saveLocalPosts();
        broadcastPostsToCloudflare(state.posts);
        renderAdminPostsList();
        renderCategoryFilters();
        renderFrontPage();
        showToast("Dispatch duplicated as draft.", "info");
    }

    function deletePost(postId) {
        const post = state.posts.find(p => p.id === postId);
        if (!post) return;

        showConfirmModal(
            `Purge "${post.title}" from the broadsheet archives? This action will sync immediately to Cloudflare.`,
            () => {
                state.posts = state.posts.filter(p => p.id !== postId);
                saveLocalPosts();
                broadcastPostsToCloudflare(state.posts);
                renderAdminPostsList();
                renderCategoryFilters();
                renderFrontPage();
                showToast("Dispatch purged from archives.", "info");
            }
        );
    }

    // =========================================================================
    // CUSTOM VINTAGE TOASTS, CONFIRM MODAL & KEYBOARD SHORTCUTS
    // =========================================================================

    function showToast(message, type = "info") {
        const container = document.getElementById("toastContainer");
        if (!container) return;

        while (container.children.length >= 4) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement("div");
        toast.className = `dispatch-toast toast-${type}`;
        toast.setAttribute("role", "status");
        toast.innerHTML = `
            <span>${escapeHtml(message)}</span>
            <button type="button" class="toast-dismiss-btn" aria-label="Dismiss notification">&times;</button>
        `;

        let dismissed = false;
        const dismiss = () => {
            if (dismissed || !toast.parentNode) return;
            dismissed = true;
            toast.style.opacity = "0";
            toast.style.transform = "translateY(8px)";
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 250);
        };

        const timer = setTimeout(dismiss, 4200);
        toast.querySelector("button").addEventListener("click", () => {
            clearTimeout(timer);
            dismiss();
        });

        container.appendChild(toast);
    }

    function showConfirmModal(message, onProceed) {
        const modal = document.getElementById("vintageConfirmModal");
        const msgEl = document.getElementById("confirmModalMessage");
        const btnCancel = document.getElementById("btnConfirmCancel");
        const btnProceed = document.getElementById("btnConfirmProceed");

        if (!modal || !msgEl || !btnCancel || !btnProceed) {
            if (confirm(message)) onProceed();
            return;
        }

        msgEl.textContent = message;

        const handleCancel = () => ModalManager.close(modal);
        const handleProceed = () => {
            ModalManager.close(modal);
            onProceed();
        };

        btnCancel.addEventListener("click", handleCancel);
        btnProceed.addEventListener("click", handleProceed);

        ModalManager.open(modal, {
            initialFocus: btnCancel,
            onClose: () => {
                btnCancel.removeEventListener("click", handleCancel);
                btnProceed.removeEventListener("click", handleProceed);
            }
        });
    }

    function setupKeyboardShortcuts() {
        window.addEventListener("keydown", (e) => {
            const tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
            const isTyping = tag === "input" || tag === "textarea" || (document.activeElement && document.activeElement.isContentEditable);

            if (e.key === "Escape" && !ModalManager.isOpen()) {
                if (state.currentView === "reader") {
                    closeArticle();
                }
            }

            if (isTyping || ModalManager.isOpen()) return;

            if (e.key === "/" && state.currentView === "front") {
                e.preventDefault();
                const searchInput = document.getElementById("archiveSearchInput");
                if (searchInput) searchInput.focus();
            } else if (e.altKey && e.key.toLowerCase() === "a") {
                e.preventDefault();
                const btn = document.getElementById("adminSanctumBtn");
                if (btn) btn.click();
            } else if (e.altKey && e.key.toLowerCase() === "m") {
                e.preventDefault();
                const btn = document.getElementById("themeToggleBtn");
                if (btn) btn.click();
            }
        });
    }

    function setupButtonRipples() {
        document.addEventListener("click", (e) => {
            const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (prefersReduced) return;

            const btn = e.target.closest(".btn-primary-action, .btn-modal-submit, .btn-nav-action");
            if (!btn) return;

            const ripple = document.createElement("span");
            ripple.className = "btn-ripple";
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + "px";
            ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
            ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        });
    }

    // =========================================================================
    // UTILITIES (Timezone-Safe Dates, Escaping, Read Estimates)
    // =========================================================================

    function getTodayLocalISO() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function formatVintageDate(dateStr) {
        if (!dateStr) return "2026";
        try {
            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
            const date = match
                ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
                : new Date(dateStr);

            if (isNaN(date.getTime())) return String(dateStr);
            return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
        } catch (_) {
            return String(dateStr);
        }
    }

    function estimateReadTime(plainText) {
        const words = plainText ? plainText.trim().split(/\s+/).length : 0;
        const mins = Math.max(1, Math.round(words / 200));
        return mins + " min";
    }

    function stripHtml(html) {
        if (!html) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = String(html).replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr|td|th)>/gi, "$& ");
        return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
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

    global.DispatchApp = {
        init: initApp,
        openArticle: openArticle,
        closeArticle: closeArticle,
        adjustFontSize: adjustFontSize,
        editPost: editPost,
        duplicatePost: duplicatePost,
        deletePost: deletePost,
        openBloggerEditor: openBloggerEditor,
        openAdminSanctum: openAdminSanctum,
        closeAdminSanctum: closeAdminSanctum,
        showToast: showToast
    };

    document.addEventListener("DOMContentLoaded", initApp);

})(typeof window !== "undefined" ? window : globalThis);
