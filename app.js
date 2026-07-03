document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const writeModal = document.getElementById('writeModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveDraftBtn = document.getElementById('cancelModalBtn');
    const articleForm = document.getElementById('articleForm');
    const articlesGrid = document.querySelector('.articles-grid');
    const progressBar = document.getElementById('readingProgress');

    const STORAGE_KEY = 'chronicle.articles';
    const DRAFT_KEY = 'chronicle.draft';
    const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=600&q=80';

    // Track the element focused before the modal opened so we can restore it.
    let lastFocusedElement = null;

    // Display Current Localized Date in Header Element
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent =
        new Date().toLocaleDateString('en-US', dateOptions);

    /* --- Helpers --- */

    // Escape user-provided text before it ever touches the DOM as markup.
    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Estimate reading time from word count (~200 wpm), floored at 1 minute.
    function estimateReadTime(text) {
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.round(words / 200));
    }

    function readStoredArticles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (err) {
            return [];
        }
    }

    function persistArticles(articles) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
        } catch (err) {
            /* Storage may be unavailable (private mode / quota); fail silently. */
        }
    }

    /* --- Article Rendering --- */

    function buildCard(article) {
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
        return cardElement;
    }

    function addArticleToGrid(article, { animate = true } = {}) {
        const card = buildCard(article);
        if (!animate) card.classList.remove('article-card--new');
        articlesGrid.insertBefore(card, articlesGrid.firstChild);
    }

    // Restore any articles the reader previously published.
    readStoredArticles().forEach((article) => addArticleToGrid(article, { animate: false }));

    /* --- Modal Interaction Handlers --- */

    function openModal() {
        lastFocusedElement = document.activeElement;
        writeModal.classList.add('active');
        writeModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        document.getElementById('postTitle').focus();
    }

    function closeModal() {
        writeModal.classList.remove('active');
        writeModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }

    function isModalOpen() {
        return writeModal.classList.contains('active');
    }

    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);

    // Click on the dimmed backdrop (but not the dialog itself) closes the modal.
    writeModal.addEventListener('click', (e) => {
        if (e.target === writeModal) closeModal();
    });

    // Escape key closes the modal for keyboard users.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalOpen()) closeModal();
    });

    /* --- Draft Persistence --- */

    const draftFields = ['postTitle', 'postAuthor', 'postCategory', 'postContent'];

    function saveDraft() {
        const draft = {};
        draftFields.forEach((id) => { draft[id] = document.getElementById(id).value; });
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (err) { /* ignore */ }
    }

    function restoreDraft() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            draftFields.forEach((id) => {
                if (draft[id]) document.getElementById(id).value = draft[id];
            });
        } catch (err) { /* ignore */ }
    }

    function clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
    }

    restoreDraft();

    // "Save Draft" now genuinely saves the in-progress fields, then closes.
    saveDraftBtn.addEventListener('click', () => {
        saveDraft();
        closeModal();
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

    /* --- Form Submission --- */

    articleForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const article = {
            title: document.getElementById('postTitle').value.trim(),
            author: document.getElementById('postAuthor').value.trim(),
            category: document.getElementById('postCategory').value.trim(),
            content: document.getElementById('postContent').value.trim(),
        };

        // Guard against whitespace-only submissions that slip past `required`.
        if (!article.title || !article.author || !article.category || !article.content) {
            return;
        }

        addArticleToGrid(article);

        const articles = readStoredArticles();
        articles.push(article);
        persistArticles(articles);

        articleForm.reset();
        clearDraft();
        closeModal();
    });
});
