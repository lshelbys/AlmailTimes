document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const writeModal = document.getElementById('writeModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const articleForm = document.getElementById('articleForm');
    const articlesGrid = document.querySelector('.articles-grid');
    const progressBar = document.getElementById('readingProgress');

    // Display Current Localized Date in Header Element
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', dateOptions);

    // Modal Interaction Handlers
    function toggleModal() {
        writeModal.classList.toggle('active');
        if (writeModal.classList.contains('active')) {
            document.getElementById('postTitle').focus();
            document.body.style.overflow = 'hidden'; // Stop body tracking scroll when typing
        } else {
            document.body.style.overflow = '';
        }
    }

    openModalBtn.addEventListener('click', toggleModal);
    closeModalBtn.addEventListener('click', toggleModal);
    cancelModalBtn.addEventListener('click', toggleModal);

    window.addEventListener('click', (e) => {
        if (e.target === writeModal) toggleModal();
    });

    // Elegant Top Progress Tracker logic on window page scroll
    window.addEventListener('scroll', () => {
        const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
        if (totalScrollable > 0) {
            const scrolledPercentage = (window.scrollY / totalScrollable) * 100;
            progressBar.style.width = `${scrolledPercentage}%`;
        }
    });

    // Form Interception and Modern Node Ingestion 
    articleForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const title = document.getElementById('postTitle').value;
        const author = document.getElementById('postAuthor').value;
        const category = document.getElementById('postCategory').value;
        const content = document.getElementById('postContent').value;

        // Select an elegant placeholder imagery concept
        const randomImageStock = "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=600&q=80";

        // Generate Element Wrapper Structure 
        const cardElement = document.createElement('div');
        cardElement.classList.add('article-card');
        
        cardElement.innerHTML = `
            <div class="card-img-wrapper">
                <div class="card-img" style="background-image: url('${randomImageStock}');"></div>
            </div>
            <div class="card-body">
                <span class="category-tag">${category}</span>
                <h3 class="card-title"><a href="#">${title}</a></h3>
                <p class="card-excerpt">${content}</p>
                <div class="author-meta">
                    <span class="author-name">${author}</span>
                    <span class="read-time">&bull; 1 min read</span>
                </div>
            </div>
        `;

        // Prepend with animation injection spacing setup
        articlesGrid.insertBefore(cardElement, articlesGrid.firstChild);

        // Reset UI Context
        articleForm.reset();
        toggleModal();
    });
});