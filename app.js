/* ============================================================
   Chronicle — front-end application logic (vanilla JS)

   Modules:
     Store      localStorage wrapper (safe in private mode)
     Articles   the article data model: seed data + reader-published
     Theme      light/dark mode with persistence
     Feed       sorting, filtering, and rendering of the grid + hero
     Reader     the article dialog, view counting, share deep-links
     Composer   the "Draft an Essay" form, drafts, live word count
     Progress   the top reading-progress bar
     Router     #latest / #trending / #saved / #story= deep links
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    /* ================= Store ================= */

    const Store = {
        read(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (err) {
                return fallback;
            }
        },
        write(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (err) {
                /* Storage may be unavailable (private mode / quota); fail silently. */
            }
        },
        remove(key) {
            try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
        },
    };

    const KEYS = {
        articles: 'chronicle.articles',
        draft: 'chronicle.draft',
        views: 'chronicle.views',
        bookmarks: 'chronicle.bookmarks',
        theme: 'chronicle.theme',
    };

    /* ================= Utilities ================= */

    function esc(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function countWords(text) {
        return String(text).trim().split(/\s+/).filter(Boolean).length;
    }

    function estimateReadTime(text) {
        return Math.max(1, Math.round(countWords(text) / 200));
    }

    function slugify(text) {
        return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'story';
    }

    function formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    /* ================= Articles (data model) ================= */

    // Pool of imagery for reader-published stories, picked deterministically
    // per title so the same story keeps the same photo across reloads.
    const IMAGE_POOL = [
        'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1519337265831-281ec6cc8514?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=600&q=80',
    ];

    function pickImage(title) {
        let hash = 0;
        for (const ch of String(title)) hash = (hash + ch.charCodeAt(0)) % 997;
        return IMAGE_POOL[hash % IMAGE_POOL.length];
    }

    const SEED_ARTICLES = [
        {
            id: 'the-art-of-minimalist-typography-in-modern-digital-journalism',
            title: 'The Art of Minimalist Typography in Modern Digital Journalism',
            category: 'Design Philosophy',
            description: 'How modern publications are stripping away the digital noise to return to what matters most: the raw relationship between the reader, the writer, and the written word.',
            author: 'Julian Vane',
            readTime: 6,
            date: Date.parse('2026-06-28T09:00:00Z'),
            featured: true,
            image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
            content: `There is a quiet revolution happening in digital publishing, and it is defined not by what is being added, but by what is being taken away. The pop-ups are disappearing. The autoplaying video rails are falling silent. In their place: a single column of well-set type, generous margins, and the confidence to let words carry the room.

Typography, it turns out, was never a decoration layered on top of journalism. It is the journalism. A line length that lets the eye travel home without losing its place. A type size that respects the reader's distance from the screen. Contrast that survives a sunlit train window. These are editorial decisions as consequential as any headline.

The publications leading this return to restraint have discovered something their metrics could not tell them: trust is typographic. A page that feels considered signals an editorial process that is considered. Readers may not name the serif, but they feel the intention behind it.

The lesson for anyone building a publication today is simple, and old. Set the type well, get out of the way, and let the relationship between writer and reader be the interface.`,
        },
        {
            id: 'decentralizing-the-future-web',
            title: 'Decentralizing the Future Web',
            category: 'Technology',
            description: 'A deep dive into how self-hosting and peer-to-peer networks are carving out space away from monolithic cloud architectures.',
            author: 'Elena Rostova',
            readTime: 4,
            date: Date.parse('2026-06-30T14:00:00Z'),
            image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
            content: `For a decade, the answer to every infrastructure question was the same: put it in the cloud. Rent the compute, rent the storage, rent — ultimately — the terms of your own existence online. That bargain made sense when the alternative was a server humming in a closet. It makes less sense now.

A new generation of self-hosters is proving the point. Their tools have grown up: single-board machines that sip power, reverse proxies that configure themselves, and peer-to-peer protocols that treat the network's edges as first-class citizens rather than mere consumers of whatever the center broadcasts.

What emerges is not a wholesale replacement of the cloud but a rebalancing. Family photo archives that never leave the house. Community forums that answer to their communities. Small services, run by the people who use them, stitched together into something that looks a great deal like the web we were promised in the first place.

The monoliths will not disappear. But their monopoly on convenience is ending, one homelab at a time.`,
        },
        {
            id: 'architecting-sustainable-urban-sanctuaries',
            title: 'Architecting Sustainable Urban Sanctuaries',
            category: 'Environment',
            description: 'Bridging the gap between brutalist structural design and native ecological systems within dense metropolis centers.',
            author: 'Marcus Vance',
            readTime: 8,
            date: Date.parse('2026-06-27T11:00:00Z'),
            image: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=600&q=80',
            content: `Concrete and canopy are not natural enemies. That is the thesis a new school of architects is testing in the densest districts of the world's fastest-growing cities, where raw structural honesty meets deliberate, native wilderness.

The approach begins with what brutalism always did well: mass, shade, and thermal patience. Thick walls that hold the night's cool through the afternoon. Deep overhangs that turn harsh sun into soft light. Then comes the newer move — treating planting not as landscaping but as infrastructure. Species are chosen the way beams are specified: for load, for lifespan, for what they give back to the system around them.

The results read as sanctuaries because they function as sanctuaries. Courtyards where birdsong competes with traffic and wins. Rooftops that harvest storms instead of shedding them. Facades that age not by staining but by greening.

None of this is nostalgia for a pre-urban world. It is a bet that the city, at its most honest and most alive, is itself a habitat worth designing for every species that has to live in it — including us.`,
        },
        {
            id: 'the-psychology-of-intentional-code',
            title: 'The Psychology of Intentional Code',
            category: 'Culture',
            description: 'Why treating software development as a literary art form leads to cleaner architecture, less technical debt, and more resilient systems.',
            author: 'K. Soleymani',
            readTime: 5,
            date: Date.parse('2026-06-25T16:00:00Z'),
            image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80',
            content: `Every codebase tells you how it was written. Some read like a first draft dashed off against a deadline — clever in places, contradictory in others, held together by comments that apologize. Others read like they were revised: names chosen and then chosen again, structures that anticipate their reader, nothing present that does not earn its place.

The difference is not talent. It is intention, and intention is a practice borrowed straight from the writer's desk. Good authors revise because the first telling of anything is for the teller; the second is for the audience. Software has audiences too — the teammate reviewing the diff, the maintainer three years out, the author themselves at 2 a.m. during an incident.

Teams that internalize this produce systems with a measurably different shape. Modules stay small because small ideas are easier to state cleanly. Dependencies stay explicit because hidden ones read like plot holes. Technical debt still accumulates — deadlines are real — but it accumulates the way an edited manuscript accumulates margin notes: visibly, deliberately, with a plan for the next pass.

Treat the codebase as literature and the compiler as merely your first, least important reader. The ones who come after care about the prose.`,
        },
    ];

    const Articles = (() => {
        // Track every id in use so user posts never collide with seeds or each other.
        const usedIds = new Set(SEED_ARTICLES.map((a) => a.id));

        function uniqueId(title) {
            const base = slugify(title);
            let id = base;
            let n = 2;
            while (usedIds.has(id)) id = `${base}-${n++}`;
            usedIds.add(id);
            return id;
        }

        // Normalize stored posts (older entries may predate the id field),
        // then persist the normalized form so ids stay stable forever.
        const mine = Store.read(KEYS.articles, []).map((a) => ({ ...a, time: a.time || Date.now() }));
        mine.forEach((a) => {
            if (!a.id) a.id = uniqueId(a.title);
            else usedIds.add(a.id);
        });
        Store.write(KEYS.articles, mine);

        function decorate(a, isMine) {
            return {
                id: a.id,
                title: a.title,
                category: a.category,
                description: isMine ? a.content : a.description,
                author: a.author,
                readTime: isMine ? estimateReadTime(a.content) : a.readTime,
                date: isMine ? a.time : a.date,
                content: a.content,
                image: isMine ? pickImage(a.title) : a.image,
                featured: !isMine && !!a.featured,
                mine: isMine,
            };
        }

        return {
            all() {
                return [
                    ...SEED_ARTICLES.map((a) => decorate(a, false)),
                    ...mine.map((a) => decorate(a, true)),
                ];
            },
            byId(id) {
                return this.all().find((a) => a.id === id) || null;
            },
            add({ title, author, category, content }) {
                const post = { id: uniqueId(title), title, author, category, content, time: Date.now() };
                mine.push(post);
                Store.write(KEYS.articles, mine);
                return decorate(post, true);
            },
            removeById(id) {
                const idx = mine.findIndex((a) => a.id === id);
                if (idx === -1) return;
                mine.splice(idx, 1);
                Store.write(KEYS.articles, mine);
                usedIds.delete(id);
            },
        };
    })();

    /* ================= DOM references ================= */

    const el = {
        grid: document.getElementById('articlesGrid'),
        featuredSection: document.getElementById('featuredSection'),
        emptyState: document.getElementById('emptyState'),
        feedLabel: document.getElementById('feedLabel'),
        feedStatus: document.getElementById('feedStatus'),
        feedStatusText: document.getElementById('feedStatusText'),
        clearFilter: document.getElementById('clearFilter'),
        searchInputs: document.querySelectorAll('#searchInput, #drawerSearchInput'),
        navLinks: document.querySelectorAll('a[data-view]'),
        themeToggles: document.querySelectorAll('.theme-toggle'),
        progressBar: document.getElementById('readingProgress'),
        writeModal: document.getElementById('writeModal'),
        readerModal: document.getElementById('readerModal'),
        openModalBtn: document.getElementById('openModalBtn'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        saveDraftBtn: document.getElementById('cancelModalBtn'),
        readerCloseBtn: document.getElementById('readerCloseBtn'),
        readerShareBtn: document.getElementById('readerShareBtn'),
        articleForm: document.getElementById('articleForm'),
        postContent: document.getElementById('postContent'),
        wordCount: document.getElementById('wordCount'),
        navToggle: document.getElementById('navToggle'),
        drawer: document.getElementById('mobileDrawer'),
        drawerOverlay: document.getElementById('drawerOverlay'),
        drawerCloseBtn: document.getElementById('drawerCloseBtn'),
        drawerWriteBtn: document.getElementById('drawerWriteBtn'),
    };

    /* ================= State ================= */

    const state = { section: 'home', category: null, query: '' };
    const viewCounts = Store.read(KEYS.views, {});
    let bookmarks = Store.read(KEYS.bookmarks, []);
    let justPublishedId = null;
    let lastFocusedElement = null;

    /* ================= Theme ================= */

    const Theme = {
        apply(mode) {
            const dark = mode === 'dark';
            document.body.classList.toggle('dark-mode', dark);
            el.themeToggles.forEach((toggle) => {
                toggle.setAttribute('aria-pressed', String(dark));
                toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
                const icon = toggle.querySelector('i');
                icon.classList.toggle('fa-sun', dark);
                icon.classList.toggle('fa-moon', !dark);
            });
        },
        toggle() {
            const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
            Store.write(KEYS.theme, next);
            this.apply(next);
        },
        init() {
            this.apply(Store.read(KEYS.theme, 'light'));
        },
    };

    /* ================= Bookmarks ================= */

    const Bookmarks = {
        has: (id) => bookmarks.includes(id),
        toggle(id) {
            bookmarks = this.has(id) ? bookmarks.filter((b) => b !== id) : [...bookmarks, id];
            Store.write(KEYS.bookmarks, bookmarks);
        },
        removeFor(id) {
            if (!this.has(id)) return;
            bookmarks = bookmarks.filter((b) => b !== id);
            Store.write(KEYS.bookmarks, bookmarks);
        },
    };

    /* ================= Feed (render pipeline) ================= */

    function actionButtonsHTML(article) {
        const saved = Bookmarks.has(article.id);
        const bookmark = `
            <button type="button" class="card-action-btn bookmark-btn${saved ? ' saved' : ''}"
                    aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved stories' : 'Save story'}">
                <i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i>
            </button>`;
        const del = article.mine ? `
            <button type="button" class="card-action-btn delete-btn" aria-label="Delete story">
                <i class="fa-regular fa-trash-can"></i>
            </button>` : '';
        return `<div class="card-actions">${bookmark}${del}</div>`;
    }

    function cardHTML(article) {
        return `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${article.image}');"></div>
                ${actionButtonsHTML(article)}
            </div>
            <div class="card-body">
                <span class="category-tag">${esc(article.category)}</span>
                <h3 class="card-title"><a href="#">${esc(article.title)}</a></h3>
                <p class="card-excerpt">${esc(article.description)}</p>
                <div class="author-meta">
                    <span class="author-name">${esc(article.author)}</span>
                    <span class="read-time">&bull; ${article.readTime} min read</span>
                </div>
            </div>`;
    }

    function buildCard(article) {
        const card = document.createElement('article');
        card.className = 'article-card';
        if (article.id === justPublishedId) card.classList.add('article-card--new');
        card.dataset.id = article.id;
        card.dataset.title = article.title;
        card.innerHTML = cardHTML(article);
        return card;
    }

    function renderFeatured(article) {
        el.featuredSection.innerHTML = `
            <a href="#" class="featured-card-link">
                <div class="featured-card" data-id="${esc(article.id)}" data-title="${esc(article.title)}">
                    <div class="featured-img-wrapper">
                        <div class="featured-img" style="background-image: url('${article.image}');"></div>
                        ${actionButtonsHTML(article)}
                    </div>
                    <div class="featured-content">
                        <span class="category-tag">${esc(article.category)}</span>
                        <h1 class="featured-title">${esc(article.title)}</h1>
                        <p class="featured-excerpt">${esc(article.description)}</p>
                        <div class="author-meta">
                            <span class="author-name">By ${esc(article.author)}</span>
                            <span class="read-time">&bull; ${article.readTime} min read</span>
                        </div>
                    </div>
                </div>
            </a>`;
    }

    function getViews(id) {
        return viewCounts[id] || 0;
    }

    function matchesFilters(article) {
        if (state.section === 'saved' && !Bookmarks.has(article.id)) return false;
        if (state.category && article.category.toLowerCase() !== state.category.toLowerCase()) return false;
        if (state.query) {
            const haystack = `${article.title} ${article.author} ${article.category} ${article.description} ${article.content}`.toLowerCase();
            if (!haystack.includes(state.query)) return false;
        }
        return true;
    }

    const SORTERS = {
        // Home keeps curation order: newest of the reader's own posts first, then seeds.
        home: (a, b) => (b.mine - a.mine) || (a.mine ? b.date - a.date : 0),
        latest: (a, b) => b.date - a.date,
        saved: (a, b) => b.date - a.date,
        trending: (a, b) => (getViews(b.id) - getViews(a.id)) || (b.date - a.date),
    };

    function renderFeed() {
        const all = Articles.all();
        const featured = all.find((a) => a.featured);

        // The hero renders separately on Home; elsewhere it joins the grid.
        const showFeatured = state.section === 'home' && featured && matchesFilters(featured);
        if (showFeatured) {
            renderFeatured(featured);
            el.featuredSection.style.display = '';
        } else {
            el.featuredSection.style.display = 'none';
        }

        const pool = state.section === 'home' ? all.filter((a) => !a.featured) : all;
        const list = pool.filter(matchesFilters).sort(SORTERS[state.section] || SORTERS.home);

        el.grid.replaceChildren(...list.map(buildCard));
        justPublishedId = null;

        const visibleCount = list.length + (showFeatured ? 1 : 0);
        el.emptyState.textContent = state.section === 'saved' && !state.query && !state.category
            ? 'No saved stories yet. Tap the bookmark on any story to keep it here.'
            : 'No stories match your search.';
        el.emptyState.hidden = visibleCount > 0;

        updateFeedChrome();
    }

    function updateFeedChrome() {
        const labels = { home: 'The Feed', latest: 'Latest', trending: 'Trending', saved: 'Saved Stories' };
        el.feedLabel.textContent = labels[state.section] || 'The Feed';

        const parts = [];
        if (state.category) parts.push(`topic <strong>${esc(state.category)}</strong>`);
        if (state.query) parts.push(`&ldquo;<strong>${esc(state.query)}</strong>&rdquo;`);

        if (parts.length) {
            el.feedStatusText.innerHTML = `Showing stories in ${parts.join(' matching ')}`;
            el.feedStatus.hidden = false;
        } else {
            el.feedStatus.hidden = true;
        }

        el.navLinks.forEach((link) => {
            link.classList.toggle('active', link.dataset.view === state.section);
        });

        // Keep the section linkable without triggering scroll or history spam.
        try {
            const hash = state.section === 'home' ? '' : `#${state.section}`;
            history.replaceState(null, '', location.pathname + location.search + hash);
        } catch (err) { /* history API may be restricted; non-essential */ }
    }

    /* ================= Overlays (shared dialog plumbing) ================= */

    // Lock background scroll whenever any modal or the mobile drawer is open.
    function syncScrollLock() {
        const locked = document.querySelector('.modal-overlay.active') || el.drawer.classList.contains('open');
        document.body.style.overflow = locked ? 'hidden' : '';
    }

    function openOverlay(overlay, focusEl) {
        lastFocusedElement = document.activeElement;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        syncScrollLock();
        if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
    }

    function closeOverlay(overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        syncScrollLock();
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }

    /* ================= Mobile Drawer ================= */

    const Drawer = {
        isOpen() {
            return el.drawer.classList.contains('open');
        },
        open() {
            lastFocusedElement = document.activeElement;
            el.drawer.classList.add('open');
            document.body.classList.add('drawer-open');
            el.drawer.setAttribute('aria-hidden', 'false');
            el.navToggle.setAttribute('aria-expanded', 'true');
            el.navToggle.setAttribute('aria-label', 'Close menu');
            syncScrollLock();
        },
        close() {
            if (!this.isOpen()) return;
            el.drawer.classList.remove('open');
            document.body.classList.remove('drawer-open');
            el.drawer.setAttribute('aria-hidden', 'true');
            el.navToggle.setAttribute('aria-expanded', 'false');
            el.navToggle.setAttribute('aria-label', 'Open menu');
            syncScrollLock();
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                lastFocusedElement.focus();
            }
        },
    };

    /* ================= Reader ================= */

    const Reader = {
        currentId: null,

        open(article) {
            this.currentId = article.id;
            document.getElementById('readerCategory').textContent = article.category;
            document.getElementById('readerTitle').textContent = article.title;
            document.getElementById('readerAuthor').textContent = article.author;
            document.getElementById('readerReadTime').innerHTML = `&bull; ${article.readTime} min read`;
            document.getElementById('readerDate').innerHTML = `&bull; ${formatDate(article.date)}`;
            document.getElementById('readerBody').textContent = article.content;
            this.resetShareBtn();

            // Count the read so it can influence the Trending view.
            viewCounts[article.id] = getViews(article.id) + 1;
            Store.write(KEYS.views, viewCounts);
            if (state.section === 'trending') renderFeed();

            const box = el.readerModal.querySelector('.reader-box');
            if (box) box.scrollTop = 0;
            openOverlay(el.readerModal, el.readerCloseBtn);
        },

        resetShareBtn() {
            el.readerShareBtn.classList.remove('copied');
            el.readerShareBtn.querySelector('span').textContent = 'Share';
        },

        async share() {
            if (!this.currentId) return;
            const url = `${location.origin}${location.pathname}${location.search}#story=${this.currentId}`;
            try {
                await navigator.clipboard.writeText(url);
            } catch (err) {
                // Clipboard API can be unavailable (permissions, file://); fall back.
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (err2) { /* give up quietly */ }
                ta.remove();
            }
            el.readerShareBtn.classList.add('copied');
            el.readerShareBtn.querySelector('span').textContent = 'Link copied';
            setTimeout(() => this.resetShareBtn(), 2000);
        },
    };

    /* ================= Composer ================= */

    const DRAFT_FIELDS = ['postTitle', 'postAuthor', 'postCategory', 'postContent'];

    const Composer = {
        updateWordCount() {
            const words = countWords(el.postContent.value);
            el.wordCount.innerHTML =
                `${words} word${words === 1 ? '' : 's'} &bull; ~${estimateReadTime(el.postContent.value)} min read`;
        },

        saveDraft() {
            const draft = {};
            DRAFT_FIELDS.forEach((id) => { draft[id] = document.getElementById(id).value; });
            Store.write(KEYS.draft, draft);
        },

        restoreDraft() {
            const draft = Store.read(KEYS.draft, null);
            if (!draft) return;
            DRAFT_FIELDS.forEach((id) => {
                if (draft[id]) document.getElementById(id).value = draft[id];
            });
        },

        publish() {
            const fields = {
                title: document.getElementById('postTitle').value.trim(),
                author: document.getElementById('postAuthor').value.trim(),
                category: document.getElementById('postCategory').value.trim(),
                content: document.getElementById('postContent').value.trim(),
            };
            // Guard against whitespace-only submissions that slip past `required`.
            if (!fields.title || !fields.author || !fields.category || !fields.content) return;

            const article = Articles.add(fields);
            justPublishedId = article.id;

            el.articleForm.reset();
            Store.remove(KEYS.draft);
            this.updateWordCount();
            closeOverlay(el.writeModal);

            // Return to Home so the author sees their new piece at the top.
            Object.assign(state, { section: 'home', category: null, query: '' });
            el.searchInputs.forEach((input) => { input.value = ''; });
            renderFeed();
        },
    };

    /* ================= Progress bar ================= */

    const Progress = {
        ticking: false,
        update() {
            const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
            const pct = totalScrollable > 0 ? (window.scrollY / totalScrollable) * 100 : 0;
            el.progressBar.style.width = `${pct}%`;
            el.progressBar.setAttribute('aria-valuenow', Math.round(pct));
            this.ticking = false;
        },
        onScroll() {
            if (!this.ticking) {
                this.ticking = true;
                window.requestAnimationFrame(() => this.update());
            }
        },
    };

    /* ================= Delete (two-step confirm) ================= */

    function handleDelete(btn) {
        if (!btn.classList.contains('armed')) {
            btn.classList.add('armed');
            btn.setAttribute('aria-label', 'Click again to confirm delete');
            setTimeout(() => {
                btn.classList.remove('armed');
                btn.setAttribute('aria-label', 'Delete story');
            }, 2500);
            return;
        }
        const id = btn.closest('[data-id]').dataset.id;
        Articles.removeById(id);
        Bookmarks.removeFor(id);
        delete viewCounts[id];
        Store.write(KEYS.views, viewCounts);
        renderFeed();
    }

    /* ================= Router ================= */

    const Router = {
        apply() {
            const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
            if (hash.startsWith('story=')) {
                const article = Articles.byId(hash.slice(6));
                if (article) Reader.open(article);
                return;
            }
            if (['home', 'latest', 'trending', 'saved'].includes(hash)) {
                state.section = hash;
            }
        },
    };

    /* ================= Event wiring ================= */

    // Current date in the masthead.
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Delegated clicks: card actions, category kickers, opening the reader.
    document.addEventListener('click', (e) => {
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if (bookmarkBtn) {
            e.preventDefault();
            Bookmarks.toggle(bookmarkBtn.closest('[data-id]').dataset.id);
            renderFeed();
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            handleDelete(deleteBtn);
            return;
        }

        // Ignore clicks inside an open dialog (reader chips, form, etc.).
        if (e.target.closest('.modal-box')) return;

        const tag = e.target.closest('.category-tag');
        if (tag) {
            e.preventDefault();
            state.category = tag.textContent.trim();
            renderFeed();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        const card = e.target.closest('[data-id]');
        if (card) {
            e.preventDefault();
            const article = Articles.byId(card.dataset.id);
            if (article) Reader.open(article);
        }
    });

    // Nav views (desktop links + drawer links share the same handler).
    el.navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            state.section = link.dataset.view;
            state.category = null; // switching sections clears a topic filter
            Drawer.close();        // auto-close when a drawer link is tapped
            renderFeed();
        });
    });

    // Search — keep the desktop and drawer inputs mirrored.
    function setQuery(value, source) {
        state.query = value.trim().toLowerCase();
        el.searchInputs.forEach((input) => {
            if (input !== source) input.value = value;
        });
        renderFeed();
    }
    el.searchInputs.forEach((input) => {
        input.addEventListener('input', () => setQuery(input.value, input));
    });

    el.clearFilter.addEventListener('click', () => {
        Object.assign(state, { category: null, query: '' });
        el.searchInputs.forEach((input) => { input.value = ''; });
        renderFeed();
    });

    // Theme (button appears in both the desktop nav and the drawer).
    el.themeToggles.forEach((toggle) => toggle.addEventListener('click', () => Theme.toggle()));

    // Mobile drawer.
    el.navToggle.addEventListener('click', () => (Drawer.isOpen() ? Drawer.close() : Drawer.open()));
    el.drawerCloseBtn.addEventListener('click', () => Drawer.close());
    el.drawerOverlay.addEventListener('click', () => Drawer.close());
    el.drawerWriteBtn.addEventListener('click', () => {
        Drawer.close();
        openOverlay(el.writeModal, document.getElementById('postTitle'));
    });

    // Overlays.
    el.openModalBtn.addEventListener('click', () => openOverlay(el.writeModal, document.getElementById('postTitle')));
    el.closeModalBtn.addEventListener('click', () => closeOverlay(el.writeModal));
    el.readerCloseBtn.addEventListener('click', () => closeOverlay(el.readerModal));
    el.readerShareBtn.addEventListener('click', () => Reader.share());
    el.saveDraftBtn.addEventListener('click', () => {
        Composer.saveDraft();
        closeOverlay(el.writeModal);
    });

    [el.writeModal, el.readerModal].forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeOverlay(overlay);
        });
    });

    // Keyboard: Escape closes dialogs/drawer, "/" jumps to search.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const open = document.querySelector('.modal-overlay.active');
            if (open) closeOverlay(open);
            else if (Drawer.isOpen()) Drawer.close();
            return;
        }
        if (e.key === '/' && !e.target.closest('input, textarea')) {
            e.preventDefault();
            el.searchInputs[0].focus();
        }
    });

    // Composer.
    el.postContent.addEventListener('input', () => Composer.updateWordCount());
    el.articleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        Composer.publish();
    });

    // Progress bar.
    window.addEventListener('scroll', () => Progress.onScroll());

    /* ================= Init ================= */

    Theme.init();
    Composer.restoreDraft();
    Composer.updateWordCount();
    Router.apply();
    renderFeed();
});
