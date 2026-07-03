document.addEventListener('DOMContentLoaded', () => {
    /* --- UI Elements --- */
    const writeModal = document.getElementById('writeModal');
    const readerModal = document.getElementById('readerModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveDraftBtn = document.getElementById('cancelModalBtn');
    const readerCloseBtn = document.getElementById('readerCloseBtn');
    const articleForm = document.getElementById('articleForm');
    const articlesGrid = document.querySelector('.articles-grid');
    const featuredSection = document.querySelector('.featured-section');
    const featuredCard = document.querySelector('.featured-card');
    const progressBar = document.getElementById('readingProgress');
    const searchInput = document.getElementById('searchInput');
    const navLinks = document.querySelectorAll('.nav-links a[data-view]');
    const feedLabel = document.getElementById('feedLabel');
    const feedStatus = document.getElementById('feedStatus');
    const feedStatusText = document.getElementById('feedStatusText');
    const clearFilterBtn = document.getElementById('clearFilter');
    const emptyState = document.getElementById('emptyState');

    const STORAGE_KEY = 'chronicle.articles';
    const DRAFT_KEY = 'chronicle.draft';
    const VIEWS_KEY = 'chronicle.views';
    const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=600&q=80';

    // Baseline timestamp so seed articles sort as "older" than anything freshly published.
    const SEED_BASE_TIME = Date.parse('2026-06-01T12:00:00Z');

    // Current feed view. `section` drives ordering; category/query filter what's shown.
    const state = { section: 'home', category: null, query: '' };

    let lastFocusedElement = null;
    const viewCounts = readJSON(VIEWS_KEY, {});

    /* --- Helpers --- */

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function estimateReadTime(text) {
        const words = String(text).trim().split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.round(words / 200));
    }

    function slugify(text) {
        return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'story';
    }

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            /* Storage may be unavailable (private mode / quota); fail silently. */
        }
    }

    // Guarantee a unique id even if two stories share a title.
    const usedIds = new Set();
    function uniqueId(title) {
        const base = slugify(title);
        let id = base;
        let n = 2;
        while (usedIds.has(id)) id = `${base}-${n++}`;
        usedIds.add(id);
        return id;
    }

    /* --- Display Current Date --- */
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent =
        new Date().toLocaleDateString('en-US', dateOptions);

    /* --- Card Construction & Indexing --- */

    // Attach searchable/sortable metadata to a card element.
    function tagCard(el, { id, title, author, category, content, time, order }) {
        el.dataset.id = id;
        el.dataset.title = title;
        el.dataset.author = author;
        el.dataset.category = category;
        el.dataset.content = content;
        el.dataset.time = String(time);
        el.dataset.order = String(order);
    }

    function buildCard(article, order) {
        const readTime = estimateReadTime(article.content);
        const cardElement = document.createElement('article');
        cardElement.classList.add('article-card', 'article-card--new');

        // Every interpolated value is escaped, so markup in user input is inert.
        cardElement.innerHTML = `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${PLACEHOLDER_IMG}');"></div>
            </div>
            <div class="card-body">
                <span class="category-tag">${escapeHTML(article.category)}</span>
                <h3 class="card-title"><a href="#">${escapeHTML(article.title)}</a></h3>
                <p class="card-excerpt">${escapeHTML(article.content)}</p>
                <div class="author-meta">
                    <span class="author-name">${escapeHTML(article.author)}</span>
                    <span class="read-time">&bull; ${readTime} min read</span>
                </div>
            </div>
        `;
        tagCard(cardElement, { ...article, order });
        return cardElement;
    }

    // Read metadata straight out of a static card already present in the HTML.
    function indexExistingCard(el, order, time) {
        const pick = (sel) => (el.querySelector(sel)?.textContent || '').trim();
        const title = pick('.card-title, .featured-title');
        const author = pick('.author-name').replace(/^By\s+/i, '');
        const category = pick('.category-tag');
        const content = pick('.card-excerpt, .featured-excerpt');
        tagCard(el, {
            id: uniqueId(title),
            title, author, category, content,
            time, order,
        });
    }

    /* --- Restore Published Articles --- */
    const storedArticles = readJSON(STORAGE_KEY, []);
    // Newest first in storage order-independent fashion: prepend so most recent is on top.
    storedArticles
        .slice()
        .sort((a, b) => (a.time || 0) - (b.time || 0))
        .forEach((article) => {
            const id = uniqueId(article.title);
            const time = article.time || Date.now();
            const card = buildCard({ ...article, id }, -time);
            card.dataset.time = String(time);
            card.classList.remove('article-card--new');
            articlesGrid.insertBefore(card, articlesGrid.firstChild);
        });

    /* --- Index Seed Cards (featured + original grid) --- */
    if (featuredCard) {
        indexExistingCard(featuredCard, 0, SEED_BASE_TIME);
        featuredCard.dataset.featured = 'true';
    }
    Array.from(articlesGrid.querySelectorAll('.article-card'))
        .filter((el) => !el.dataset.id)
        .forEach((el, i) => indexExistingCard(el, 1000 + i, SEED_BASE_TIME - (i + 1) * 3600000));

    /* --- Feed Rendering (sort + filter) --- */

    function getViews(id) {
        return viewCounts[id] || 0;
    }

    function matchesFilters(dataset) {
        if (state.category && (dataset.category || '').toLowerCase() !== state.category.toLowerCase()) {
            return false;
        }
        if (state.query) {
            const haystack = `${dataset.title} ${dataset.author} ${dataset.category} ${dataset.content}`.toLowerCase();
            if (!haystack.includes(state.query)) return false;
        }
        return true;
    }

    function renderFeed() {
        const cards = Array.from(articlesGrid.querySelectorAll('.article-card'));

        // Order the cards according to the active section.
        let ordered;
        if (state.section === 'latest') {
            ordered = cards.slice().sort((a, b) => Number(b.dataset.time) - Number(a.dataset.time));
        } else if (state.section === 'trending') {
            ordered = cards.slice().sort((a, b) => {
                const diff = getViews(b.dataset.id) - getViews(a.dataset.id);
                return diff !== 0 ? diff : Number(b.dataset.time) - Number(a.dataset.time);
            });
        } else {
            ordered = cards.slice().sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
        }
        ordered.forEach((card) => articlesGrid.appendChild(card));

        // Apply category/search filters by toggling visibility.
        let visibleCount = 0;
        cards.forEach((card) => {
            const show = matchesFilters(card.dataset);
            card.style.display = show ? '' : 'none';
            if (show) visibleCount += 1;
        });

        // The featured hero shows only on Home, and only if it passes the active filters.
        if (featuredSection && featuredCard) {
            const showFeatured = state.section === 'home' && matchesFilters(featuredCard.dataset);
            featuredSection.style.display = showFeatured ? '' : 'none';
            if (showFeatured) visibleCount += 1;
        }

        emptyState.hidden = visibleCount > 0;
        updateFeedChrome();
    }

    // Update the section label + active-filter status bar.
    function updateFeedChrome() {
        const labels = { home: 'The Feed', latest: 'Latest', trending: 'Trending' };
        feedLabel.textContent = labels[state.section] || 'The Feed';

        const parts = [];
        if (state.category) parts.push(`topic <strong>${escapeHTML(state.category)}</strong>`);
        if (state.query) parts.push(`&ldquo;<strong>${escapeHTML(state.query)}</strong>&rdquo;`);

        if (parts.length) {
            feedStatusText.innerHTML = `Showing stories in ${parts.join(' matching ')}`;
            feedStatus.hidden = false;
        } else {
            feedStatus.hidden = true;
        }

        navLinks.forEach((link) => {
            link.classList.toggle('active', link.dataset.view === state.section);
        });
    }

    /* --- Overlay (modal) Management --- */

    function openOverlay(overlay, focusEl) {
        lastFocusedElement = document.activeElement;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
    }

    function closeOverlay(overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        // Only release the scroll lock if no other overlay is still open.
        if (!document.querySelector('.modal-overlay.active')) {
            document.body.style.overflow = '';
        }
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }

    // Backdrop click closes whichever overlay was clicked.
    [writeModal, readerModal].forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeOverlay(overlay);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const openOne = document.querySelector('.modal-overlay.active');
        if (openOne) closeOverlay(openOne);
    });

    /* --- Reader --- */

    function openReader(card) {
        const d = card.dataset;
        document.getElementById('readerCategory').textContent = d.category;
        document.getElementById('readerTitle').textContent = d.title;
        document.getElementById('readerAuthor').textContent = d.author;
        document.getElementById('readerReadTime').innerHTML = `&bull; ${estimateReadTime(d.content)} min read`;
        document.getElementById('readerBody').textContent = d.content;

        // Count the read so it can influence the Trending view.
        viewCounts[d.id] = getViews(d.id) + 1;
        writeJSON(VIEWS_KEY, viewCounts);
        if (state.section === 'trending') renderFeed();

        openReader.scrollReset();
        openOverlay(readerModal, readerCloseBtn);
    }
    openReader.scrollReset = () => {
        const box = readerModal.querySelector('.reader-box');
        if (box) box.scrollTop = 0;
    };

    readerCloseBtn.addEventListener('click', () => closeOverlay(readerModal));

    /* --- Delegated Clicks: category filter + open reader --- */
    document.addEventListener('click', (e) => {
        // Ignore clicks that happen inside an overlay dialog.
        if (e.target.closest('.modal-box')) return;

        const tag = e.target.closest('.category-tag');
        if (tag) {
            e.preventDefault();
            filterByCategory(tag.textContent.trim());
            return;
        }

        const card = e.target.closest('.article-card, .featured-card');
        if (card && card.dataset.id) {
            e.preventDefault();
            openReader(card);
        }
    });

    function filterByCategory(category) {
        state.category = category;
        renderFeed();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* --- Navigation Views --- */
    navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            state.section = link.dataset.view;
            state.category = null; // switching sections clears a topic filter
            renderFeed();
        });
    });

    /* --- Search --- */
    searchInput.addEventListener('input', () => {
        state.query = searchInput.value.trim().toLowerCase();
        renderFeed();
    });

    /* --- Clear Filters --- */
    clearFilterBtn.addEventListener('click', () => {
        state.category = null;
        state.query = '';
        searchInput.value = '';
        renderFeed();
    });

    /* --- Write Modal + Draft Persistence --- */
    const draftFields = ['postTitle', 'postAuthor', 'postCategory', 'postContent'];

    function saveDraft() {
        const draft = {};
        draftFields.forEach((id) => { draft[id] = document.getElementById(id).value; });
        writeJSON(DRAFT_KEY, draft);
    }

    function restoreDraft() {
        const draft = readJSON(DRAFT_KEY, null);
        if (!draft) return;
        draftFields.forEach((id) => {
            if (draft[id]) document.getElementById(id).value = draft[id];
        });
    }

    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
    }

    restoreDraft();

    openModalBtn.addEventListener('click', () => openOverlay(writeModal, document.getElementById('postTitle')));
    closeModalBtn.addEventListener('click', () => closeOverlay(writeModal));
    saveDraftBtn.addEventListener('click', () => {
        saveDraft();
        closeOverlay(writeModal);
    });

    /* --- Reading Progress Tracker (throttled via rAF) --- */
    let progressTicking = false;
    function updateProgress() {
        const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
        const pct = totalScrollable > 0 ? (window.scrollY / totalScrollable) * 100 : 0;
        progressBar.style.width = `${pct}%`;
        progressBar.setAttribute('aria-valuenow', Math.round(pct));
        progressTicking = false;
    }
    window.addEventListener('scroll', () => {
        if (!progressTicking) {
            progressTicking = true;
            window.requestAnimationFrame(updateProgress);
        }
    });

    /* --- Publish --- */
    articleForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const draft = {
            title: document.getElementById('postTitle').value.trim(),
            author: document.getElementById('postAuthor').value.trim(),
            category: document.getElementById('postCategory').value.trim(),
            content: document.getElementById('postContent').value.trim(),
        };

        // Guard against whitespace-only submissions that slip past `required`.
        if (!draft.title || !draft.author || !draft.category || !draft.content) return;

        const time = Date.now();
        const article = { ...draft, id: uniqueId(draft.title), time };
        const card = buildCard(article, -time);
        card.dataset.time = String(time);
        articlesGrid.insertBefore(card, articlesGrid.firstChild);

        const persisted = readJSON(STORAGE_KEY, []);
        persisted.push(draft.title ? { ...draft, time } : draft);
        writeJSON(STORAGE_KEY, persisted);

        articleForm.reset();
        clearDraft();
        closeOverlay(writeModal);

        // Return to Home so the author sees their new piece at the top.
        state.section = 'home';
        state.category = null;
        state.query = '';
        searchInput.value = '';
        renderFeed();
    });

    /* --- Initial Paint --- */
    renderFeed();
});
