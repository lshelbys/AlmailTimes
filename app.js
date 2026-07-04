/* ============================================================
   Almail Times — front-end application logic (vanilla JS)

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
        articles: 'almailTimes.articles',
        draft: 'almailTimes.draft',
        views: 'almailTimes.views',
        bookmarks: 'almailTimes.bookmarks',
        theme: 'almailTimes.theme',
        lang: 'almailTimes.lang',
    };

    // One-time migration: carry existing readers' data over from the legacy
    // "chronicle." namespace so the rebrand doesn't wipe saved articles,
    // drafts, bookmarks, theme, or language. Idempotent and safe to re-run.
    (() => {
        try {
            Object.keys(KEYS).forEach((name) => {
                const legacyKey = `chronicle.${name}`;
                const legacyVal = localStorage.getItem(legacyKey);
                if (legacyVal === null) return;
                // Copy the legacy value only if the new key is empty (never
                // clobber newer data), then always retire the legacy key.
                if (localStorage.getItem(KEYS[name]) === null) {
                    localStorage.setItem(KEYS[name], legacyVal);
                }
                localStorage.removeItem(legacyKey);
            });
        } catch (err) {
            /* Storage unavailable (private mode / disabled); nothing to migrate. */
        }
    })();

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

    function locale() {
        return state.lang === 'ar' ? 'ar' : 'en-US';
    }

    function formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Localize a number (Arabic mode renders Eastern Arabic numerals).
    function num(n) {
        return Number(n).toLocaleString(locale());
    }

    // Resolve a possibly-localized field: {en, ar} objects pick the active
    // language; plain strings (user posts) pass through unchanged.
    function L(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value[state.lang] ?? value.en ?? '';
        }
        return value;
    }

    // Make a user-supplied image URL safe to drop into a CSS url('...').
    // Only http(s) and data:image are allowed; problem characters are encoded.
    function sanitizeImageUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        if (!/^https?:\/\//i.test(raw) && !/^data:image\//i.test(raw)) return '';
        return raw
            .replace(/\\/g, '%5C')
            .replace(/"/g, '%22')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\s/g, '%20');
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
            title: {
                en: 'The Art of Minimalist Typography in Modern Digital Journalism',
                ar: 'فنّ الطباعة التجريدية في الصحافة الرقمية الحديثة',
            },
            category: { en: 'Design Philosophy', ar: 'فلسفة التصميم' },
            description: {
                en: 'How modern publications are stripping away the digital noise to return to what matters most: the raw relationship between the reader, the writer, and the written word.',
                ar: 'كيف تتخلّى المنشورات الحديثة عن الضجيج الرقمي لتعود إلى ما يهمّ حقًّا: العلاقة الخام بين القارئ والكاتب والكلمة المكتوبة.',
            },
            author: { en: 'Julian Vane', ar: 'جوليان فين' },
            readTime: 6,
            date: Date.parse('2026-06-28T09:00:00Z'),
            featured: true,
            image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
            content: {
                en: `There is a quiet revolution happening in digital publishing, and it is defined not by what is being added, but by what is being taken away. The pop-ups are disappearing. The autoplaying video rails are falling silent. In their place: a single column of well-set type, generous margins, and the confidence to let words carry the room.

Typography, it turns out, was never a decoration layered on top of journalism. It is the journalism. A line length that lets the eye travel home without losing its place. A type size that respects the reader's distance from the screen. Contrast that survives a sunlit train window. These are editorial decisions as consequential as any headline.

The publications leading this return to restraint have discovered something their metrics could not tell them: trust is typographic. A page that feels considered signals an editorial process that is considered. Readers may not name the serif, but they feel the intention behind it.

The lesson for anyone building a publication today is simple, and old. Set the type well, get out of the way, and let the relationship between writer and reader be the interface.`,
                ar: `ثمّة ثورةٌ هادئةٌ تجري في عالم النشر الرقمي، لا يحدّدها ما يُضاف بل ما يُنتزَع. النوافذ المنبثقة تختفي، ومقاطع الفيديو التلقائية تخفت، ليحلّ محلّها عمودٌ واحدٌ من الحروف المضبوطة، وهوامش سخيّة، وثقةٌ بأن تحمل الكلمات المشهد وحدها.

تبيّن أن الطباعة لم تكن يومًا زينةً تُضاف فوق الصحافة؛ بل هي الصحافة نفسها. طول سطرٍ يتيح للعين أن تعود إلى بدايتها دون أن تضلّ، وحجم حرفٍ يحترم مسافة القارئ عن الشاشة، وتباينٌ ينجو تحت ضوء نافذة قطارٍ ساطعة. هذه قراراتٌ تحريريةٌ لا تقلّ أثرًا عن أيّ عنوان.

اكتشفت المنشورات الرائدة في هذا التقشّف ما عجزت مقاييسها عن إخبارها به: الثقة طباعية. فالصفحة التي تبدو مدروسةً تدلّ على عمليةٍ تحريريةٍ مدروسة. قد لا يعرف القارئ اسم الخطّ، لكنه يشعر بالنيّة الكامنة خلفه.

الدرس لمن يبني منشورًا اليوم بسيطٌ وقديم: اضبط الحروف جيّدًا، ثم تنحَّ جانبًا، ودع العلاقة بين الكاتب والقارئ تكون هي الواجهة.`,
            },
        },
        {
            id: 'decentralizing-the-future-web',
            title: {
                en: 'Decentralizing the Future Web',
                ar: 'لا مركزية شبكة المستقبل',
            },
            category: { en: 'Technology', ar: 'التقنية' },
            description: {
                en: 'A deep dive into how self-hosting and peer-to-peer networks are carving out space away from monolithic cloud architectures.',
                ar: 'غوصٌ عميقٌ في كيفية انتزاع الاستضافة الذاتية والشبكات النِّدّية مساحةً بعيدًا عن بِنى السحابة الأحادية العملاقة.',
            },
            author: { en: 'Elena Rostova', ar: 'إيلينا روستوفا' },
            readTime: 4,
            date: Date.parse('2026-06-30T14:00:00Z'),
            image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
            content: {
                en: `For a decade, the answer to every infrastructure question was the same: put it in the cloud. Rent the compute, rent the storage, rent — ultimately — the terms of your own existence online. That bargain made sense when the alternative was a server humming in a closet. It makes less sense now.

A new generation of self-hosters is proving the point. Their tools have grown up: single-board machines that sip power, reverse proxies that configure themselves, and peer-to-peer protocols that treat the network's edges as first-class citizens rather than mere consumers of whatever the center broadcasts.

What emerges is not a wholesale replacement of the cloud but a rebalancing. Family photo archives that never leave the house. Community forums that answer to their communities. Small services, run by the people who use them, stitched together into something that looks a great deal like the web we were promised in the first place.

The monoliths will not disappear. But their monopoly on convenience is ending, one homelab at a time.`,
                ar: `طوال عقدٍ كامل، كان الجواب عن كلّ سؤالٍ يخصّ البنية التحتية واحدًا: ضعه في السحابة. استأجر المعالجة، واستأجر التخزين، بل استأجر في النهاية شروط وجودك على الإنترنت. كان ذلك منطقيًّا حين كان البديل خادمًا يئزّ في خزانة، أما اليوم فأقلّ منطقيةً.

جيلٌ جديدٌ من أصحاب الاستضافة الذاتية يثبت وجهة النظر. نضجت أدواتهم: أجهزةٌ صغيرةٌ تقتصد الطاقة، ووسطاء عكسيون يهيّئون أنفسهم، وبروتوكولاتٌ نِدّيةٌ تعامل أطراف الشبكة بوصفها مواطنين من الدرجة الأولى لا مجرّد مستهلكين لما يبثّه المركز.

ما ينشأ ليس استبدالًا كاملًا للسحابة بل إعادة توازن: أرشيف صورٍ عائليٍّ لا يغادر البيت، ومنتدياتٌ مجتمعيةٌ تخضع لمجتمعاتها، وخدماتٌ صغيرةٌ يديرها من يستخدمونها، مغزولةٌ معًا في شيءٍ يشبه كثيرًا الويب الذي وُعدنا به أول الأمر.

لن تختفي العمالقة، لكن احتكارها للراحة يقترب من نهايته، مختبرًا منزليًّا تلو الآخر.`,
            },
        },
        {
            id: 'architecting-sustainable-urban-sanctuaries',
            title: {
                en: 'Architecting Sustainable Urban Sanctuaries',
                ar: 'هندسة ملاذاتٍ حضريةٍ مستدامة',
            },
            category: { en: 'Environment', ar: 'البيئة' },
            description: {
                en: 'Bridging the gap between brutalist structural design and native ecological systems within dense metropolis centers.',
                ar: 'ردمُ الهوّة بين التصميم الإنشائي الوحشي والأنظمة البيئية المحلية في قلب المدن المكتظّة.',
            },
            author: { en: 'Marcus Vance', ar: 'ماركوس فانس' },
            readTime: 8,
            date: Date.parse('2026-06-27T11:00:00Z'),
            image: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=600&q=80',
            content: {
                en: `Concrete and canopy are not natural enemies. That is the thesis a new school of architects is testing in the densest districts of the world's fastest-growing cities, where raw structural honesty meets deliberate, native wilderness.

The approach begins with what brutalism always did well: mass, shade, and thermal patience. Thick walls that hold the night's cool through the afternoon. Deep overhangs that turn harsh sun into soft light. Then comes the newer move — treating planting not as landscaping but as infrastructure. Species are chosen the way beams are specified: for load, for lifespan, for what they give back to the system around them.

The results read as sanctuaries because they function as sanctuaries. Courtyards where birdsong competes with traffic and wins. Rooftops that harvest storms instead of shedding them. Facades that age not by staining but by greening.

None of this is nostalgia for a pre-urban world. It is a bet that the city, at its most honest and most alive, is itself a habitat worth designing for every species that has to live in it — including us.`,
                ar: `الخرسانة والخُضرة ليستا عدوّين بالفطرة. تلك أطروحةٌ تختبرها مدرسةٌ جديدةٌ من المعماريين في أشدّ أحياء المدن الأسرع نموًّا ازدحامًا، حيث تلتقي الصراحة الإنشائية الخام ببرّيةٍ محليةٍ مقصودة.

يبدأ النهج بما أتقنته الوحشية دائمًا: الكتلة، والظلّ، والصبر الحراري. جدرانٌ سميكةٌ تحفظ برودة الليل حتى العصر، ونتوءاتٌ عميقةٌ تحوّل الشمس القاسية إلى ضوءٍ ناعم. ثم تأتي الخطوة الأحدث: معاملة الغرس لا بوصفه تنسيقًا للحدائق بل بنيةً تحتية. تُنتقى الأنواع كما تُحدَّد العوارض: للحِمل، ولطول العمر، ولما تردّه إلى النظام من حولها.

تُقرأ النتائج ملاذاتٍ لأنها تعمل ملاذاتٍ فعلًا: أفنيةٌ ينافس فيها تغريد الطير ضجيج المرور فيغلبه، وأسطحٌ تحصد العواصف بدل أن تنبذها، وواجهاتٌ لا تشيخ بالتبقّع بل بالاخضرار.

ليس في هذا حنينٌ إلى عالمٍ ما قبل المدن، بل رهانٌ على أن المدينة، في أصدق حالاتها وأكثرها حياةً، موئلٌ يستحقّ أن يُصمَّم لكلّ نوعٍ يعيش فيه، ونحن منهم.`,
            },
        },
        {
            id: 'the-psychology-of-intentional-code',
            title: {
                en: 'The Psychology of Intentional Code',
                ar: 'سيكولوجيا الشيفرة المقصودة',
            },
            category: { en: 'Culture', ar: 'ثقافة' },
            description: {
                en: 'Why treating software development as a literary art form leads to cleaner architecture, less technical debt, and more resilient systems.',
                ar: 'لماذا يقود التعامل مع تطوير البرمجيات بوصفه فنًّا أدبيًّا إلى معماريةٍ أنظف، وديونٍ تقنيةٍ أقل، وأنظمةٍ أكثر مرونة.',
            },
            author: { en: 'K. Soleymani', ar: 'ك. سليماني' },
            readTime: 5,
            date: Date.parse('2026-06-25T16:00:00Z'),
            image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80',
            content: {
                en: `Every codebase tells you how it was written. Some read like a first draft dashed off against a deadline — clever in places, contradictory in others, held together by comments that apologize. Others read like they were revised: names chosen and then chosen again, structures that anticipate their reader, nothing present that does not earn its place.

The difference is not talent. It is intention, and intention is a practice borrowed straight from the writer's desk. Good authors revise because the first telling of anything is for the teller; the second is for the audience. Software has audiences too — the teammate reviewing the diff, the maintainer three years out, the author themselves at 2 a.m. during an incident.

Teams that internalize this produce systems with a measurably different shape. Modules stay small because small ideas are easier to state cleanly. Dependencies stay explicit because hidden ones read like plot holes. Technical debt still accumulates — deadlines are real — but it accumulates the way an edited manuscript accumulates margin notes: visibly, deliberately, with a plan for the next pass.

Treat the codebase as literature and the compiler as merely your first, least important reader. The ones who come after care about the prose.`,
                ar: `كلّ قاعدة شيفرةٍ تخبرك كيف كُتبت. بعضها يُقرأ كمسودّةٍ أولى كُتبت على عجلٍ قبيل موعدٍ نهائي، بارعةٌ في مواضع، متناقضةٌ في أخرى، تشدّها تعليقاتٌ تعتذر. وبعضها يُقرأ كأنه نُقِّح: أسماءٌ اختيرت ثم أُعيد اختيارها، وبنى تتوقّع قارئها، ولا شيء فيها لا يستحقّ مكانه.

الفارق ليس الموهبة، بل النيّة، والنيّة ممارسةٌ مستعارةٌ مباشرةً من مكتب الكاتب. يُنقّح الكتّاب المجيدون لأن الرواية الأولى لأيّ شيءٍ إنما هي لصاحبها، أما الثانية فللجمهور. وللبرمجيات جمهورٌ أيضًا: الزميل الذي يراجع الفرق، والقائم على الصيانة بعد ثلاث سنوات، والمؤلّف نفسه في الثانية صباحًا أثناء عطلٍ طارئ.

الفرق الذين يستوعبون هذا ينتجون أنظمةً ذات شكلٍ مختلفٍ قياسًا: تبقى الوحدات صغيرةً لأن الأفكار الصغيرة أسهل صياغةً، وتبقى التبعيّات صريحةً لأن الخفيّة منها تُقرأ كثغراتٍ في الحبكة. لا يزال الدَّين التقني يتراكم — فالمواعيد حقيقية — لكنه يتراكم كما تتراكم هوامش مخطوطةٍ مُنقّحة: بوضوحٍ وقصدٍ وخطّةٍ للجولة التالية.

عامِل قاعدة الشيفرة بوصفها أدبًا، والمترجِم مجرّد قارئك الأول والأقلّ أهميّة. فمن يأتون بعده هم من يهتمّون بالنثر.`,
            },
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
            if (isMine) {
                return {
                    id: a.id,
                    title: a.title,
                    category: a.category,
                    description: a.content,
                    author: a.author,
                    readTime: estimateReadTime(a.content),
                    date: a.time,
                    content: a.content,
                    image: sanitizeImageUrl(a.image) || pickImage(a.title),
                    featured: false,
                    mine: true,
                };
            }
            // Seed articles carry {en, ar} fields resolved for the active language.
            return {
                id: a.id,
                title: L(a.title),
                category: L(a.category),
                description: L(a.description),
                author: L(a.author),
                readTime: a.readTime,
                date: a.date,
                content: L(a.content),
                image: a.image,
                featured: !!a.featured,
                mine: false,
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
            add({ title, author, category, content, image }) {
                const post = { id: uniqueId(title), title, author, category, content, image: image || '', time: Date.now() };
                mine.push(post);
                Store.write(KEYS.articles, mine);
                return decorate(post, true);
            },
            // Edit an existing user post in place; id and timestamp are kept
            // stable so bookmarks, view counts, and deep links keep working.
            update(id, { title, author, category, content, image }) {
                const post = mine.find((a) => a.id === id);
                if (!post) return null;
                Object.assign(post, { title, author, category, content, image: image || '' });
                Store.write(KEYS.articles, mine);
                return decorate(post, true);
            },
            isMine(id) {
                return mine.some((a) => a.id === id);
            },
            rawById(id) {
                return mine.find((a) => a.id === id) || null;
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
        postImage: document.getElementById('postImage'),
        wordCount: document.getElementById('wordCount'),
        langToggles: document.querySelectorAll('.lang-toggle'),
        navToggle: document.getElementById('navToggle'),
        drawer: document.getElementById('mobileDrawer'),
        drawerOverlay: document.getElementById('drawerOverlay'),
        drawerCloseBtn: document.getElementById('drawerCloseBtn'),
        drawerWriteBtn: document.getElementById('drawerWriteBtn'),
        modalTitle: document.getElementById('modalTitle'),
        publishBtn: document.getElementById('publishBtn'),
        readerRelated: document.getElementById('readerRelated'),
        backToTop: document.getElementById('backToTop'),
        toastRegion: document.getElementById('toastRegion'),
        themeColorMeta: document.getElementById('themeColorMeta'),
    };

    /* ================= State ================= */

    const state = { section: 'home', category: null, query: '', lang: 'en' };
    const viewCounts = Store.read(KEYS.views, {});
    let bookmarks = Store.read(KEYS.bookmarks, []);
    let justPublishedId = null;
    let lastFocusedElement = null;

    /* ================= Theme ================= */

    const Theme = {
        apply(mode) {
            const dark = mode === 'dark';
            document.body.classList.toggle('dark-mode', dark);
            // Keep the mobile browser chrome color in sync with the canvas.
            if (el.themeColorMeta) el.themeColorMeta.setAttribute('content', dark ? '#1b1512' : '#fbf2e6');
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

    /* ================= Toasts ================= */

    const Toast = {
        show(message, icon = 'fa-circle-check') {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            toast.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
            toast.querySelector('span').textContent = message; // textContent = no injection
            el.toastRegion.appendChild(toast);
            // Force reflow so the transition runs, then reveal.
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => {
                toast.classList.remove('show');
                toast.addEventListener('transitionend', () => toast.remove(), { once: true });
                setTimeout(() => toast.remove(), 500); // fallback if transitionend doesn't fire
            }, 2600);
        },
    };

    /* ================= Internationalization ================= */

    const STRINGS = {
        en: {
            write: 'Write',
            search: 'Search stories…',
            motto: 'A curated canvas for architectural code, intentional design, and deep human thought.',
            draftTitle: 'Draft an Essay',
            labelTitle: 'Title', labelAuthor: 'Author', labelTopic: 'Topic',
            labelImage: 'Image URL (optional)', labelBody: 'Body',
            phTitle: 'Give your story an evocative title...', phAuthor: 'Your name',
            phTopic: 'e.g., Culture, Tech, Design', phImage: 'https://images.unsplash.com/…',
            phBody: 'Begin writing...',
            saveDraft: 'Save Draft', publish: 'Publish Piece',
            nav_home: 'Home', nav_latest: 'Latest', nav_trending: 'Trending', nav_saved: 'Saved',
            feed_home: 'The Feed', feed_latest: 'Latest', feed_trending: 'Trending', feed_saved: 'Saved Stories',
            empty: 'No stories match your search.',
            emptySaved: 'No saved stories yet. Tap the bookmark on any story to keep it here.',
            share: 'Share', copied: 'Link copied',
            minRead: '{n} min read', byAuthor: 'By {author}',
            words: '{n} words', wordsOne: '1 word',
            statusTopic: 'Showing stories in topic “{cat}”',
            statusQuery: 'Results for “{q}”',
            statusBoth: 'Results for “{q}” in topic “{cat}”',
            langLabel: 'ع', langAria: 'التبديل إلى العربية',
            editTitle: 'Edit Story', update: 'Update Piece',
            editStory: 'Edit story',
            relatedHeading: 'More in {cat}',
            toastPublished: 'Story published', toastUpdated: 'Story updated',
            toastSaved: 'Saved to your list', toastUnsaved: 'Removed from saved',
            toastDeleted: 'Story deleted', toastCopied: 'Link copied to clipboard',
            toastDraft: 'Draft saved',
        },
        ar: {
            write: 'اكتب',
            search: 'ابحث في المقالات…',
            motto: 'لوحةٌ منسّقة للشيفرة المعمارية، والتصميم المقصود، والفكر الإنساني العميق.',
            draftTitle: 'اكتب مقالًا',
            labelTitle: 'العنوان', labelAuthor: 'الكاتب', labelTopic: 'التصنيف',
            labelImage: 'رابط الصورة (اختياري)', labelBody: 'النص',
            phTitle: 'امنح مقالك عنوانًا مُوحِيًا…', phAuthor: 'اسمك',
            phTopic: 'مثال: ثقافة، تقنية، تصميم', phImage: 'https://images.unsplash.com/…',
            phBody: 'ابدأ الكتابة…',
            saveDraft: 'احفظ مسودة', publish: 'انشر المقال',
            nav_home: 'الرئيسية', nav_latest: 'الأحدث', nav_trending: 'الأكثر رواجًا', nav_saved: 'المحفوظة',
            feed_home: 'المستجدّات', feed_latest: 'الأحدث', feed_trending: 'الأكثر رواجًا', feed_saved: 'المقالات المحفوظة',
            empty: 'لا توجد مقالات تطابق بحثك.',
            emptySaved: 'لا مقالات محفوظة بعد. انقر على إشارة الحفظ في أيّ مقال للاحتفاظ به هنا.',
            share: 'مشاركة', copied: 'تم نسخ الرابط',
            minRead: '{n} دقيقة قراءة', byAuthor: 'بقلم {author}',
            words: '{n} كلمة', wordsOne: 'كلمة واحدة',
            statusTopic: 'عرض مقالات موضوع «{cat}»',
            statusQuery: 'نتائج البحث عن «{q}»',
            statusBoth: 'نتائج «{q}» ضمن موضوع «{cat}»',
            langLabel: 'EN', langAria: 'Switch to English',
            editTitle: 'عدّل المقال', update: 'حدّث المقال',
            editStory: 'تعديل المقال',
            relatedHeading: 'المزيد في {cat}',
            toastPublished: 'تم نشر المقال', toastUpdated: 'تم تحديث المقال',
            toastSaved: 'أُضيف إلى قائمتك', toastUnsaved: 'أُزيل من المحفوظة',
            toastDeleted: 'تم حذف المقال', toastCopied: 'نُسخ الرابط إلى الحافظة',
            toastDraft: 'تم حفظ المسودة',
        },
    };

    function t(key, params) {
        let s = STRINGS[state.lang] && STRINGS[state.lang][key];
        if (s == null) s = STRINGS.en[key] != null ? STRINGS.en[key] : key;
        if (params) Object.keys(params).forEach((k) => { s = s.replace(`{${k}}`, params[k]); });
        return s;
    }

    const I18n = {
        apply(lang) {
            state.lang = lang === 'ar' ? 'ar' : 'en';
            Store.write(KEYS.lang, state.lang);
            const isAr = state.lang === 'ar';

            document.documentElement.lang = state.lang;
            document.documentElement.dir = isAr ? 'rtl' : 'ltr';
            document.body.classList.toggle('lang-ar', isAr);

            // Static strings by data attribute.
            document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
            document.querySelectorAll('[data-i18n-ph]').forEach((node) => { node.placeholder = t(node.dataset.i18nPh); });

            // Nav links resolve from their view id (desktop + drawer).
            el.navLinks.forEach((link) => { link.textContent = t(`nav_${link.dataset.view}`); });

            // Language toggle buttons show the language you'd switch TO.
            el.langToggles.forEach((btn) => {
                btn.textContent = t('langLabel');
                btn.setAttribute('aria-label', t('langAria'));
            });

            // Masthead date in the active locale.
            document.getElementById('currentDate').textContent = new Date().toLocaleDateString(locale(), {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });

            // A category/query captured in one language won't match the other,
            // so switching languages clears the active filter for a clean slate.
            state.category = null;
            state.query = '';
            el.searchInputs.forEach((input) => { input.value = ''; });

            renderFeed();
            Composer.updateWordCount();
            Composer.applyMode(); // keep the write dialog's heading/submit labels correct
            if (el.readerModal.classList.contains('active') && Reader.currentId) {
                const article = Articles.byId(Reader.currentId);
                if (article) Reader.fill(article);
            }
        },
        toggle() {
            this.apply(state.lang === 'ar' ? 'en' : 'ar');
        },
        init() {
            this.apply(Store.read(KEYS.lang, 'en'));
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
        const edit = article.mine ? `
            <button type="button" class="card-action-btn edit-btn" aria-label="${esc(t('editStory'))}">
                <i class="fa-regular fa-pen-to-square"></i>
            </button>` : '';
        const del = article.mine ? `
            <button type="button" class="card-action-btn delete-btn" aria-label="Delete story">
                <i class="fa-regular fa-trash-can"></i>
            </button>` : '';
        return `<div class="card-actions">${bookmark}${edit}${del}</div>`;
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
                    <span class="read-time">&bull; ${esc(t('minRead', { n: num(article.readTime) }))}</span>
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
                            <span class="author-name">${esc(t('byAuthor', { author: article.author }))}</span>
                            <span class="read-time">&bull; ${esc(t('minRead', { n: num(article.readTime) }))}</span>
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
            ? t('emptySaved')
            : t('empty');
        el.emptyState.hidden = visibleCount > 0;

        updateFeedChrome();
    }

    function updateFeedChrome() {
        el.feedLabel.textContent = t(`feed_${state.section}`);

        // Build the active-filter status line, with bolded values.
        const cat = state.category ? `<strong>${esc(state.category)}</strong>` : '';
        const q = state.query ? `<strong>${esc(state.query)}</strong>` : '';
        if (state.category && state.query) {
            el.feedStatusText.innerHTML = t('statusBoth', { cat, q });
            el.feedStatus.hidden = false;
        } else if (state.category) {
            el.feedStatusText.innerHTML = t('statusTopic', { cat });
            el.feedStatus.hidden = false;
        } else if (state.query) {
            el.feedStatusText.innerHTML = t('statusQuery', { q });
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

        // Populate the dialog from an article (also used to re-render on language switch).
        fill(article) {
            this.currentId = article.id;
            document.getElementById('readerCategory').textContent = article.category;
            document.getElementById('readerTitle').textContent = article.title;
            document.getElementById('readerAuthor').textContent = article.author;
            document.getElementById('readerReadTime').textContent = `• ${t('minRead', { n: num(article.readTime) })}`;
            document.getElementById('readerDate').textContent = `• ${formatDate(article.date)}`;
            document.getElementById('readerBody').textContent = article.content;
            this.renderRelated(article);
            this.resetShareBtn();
        },

        // Up to three other stories in the same topic, as clickable links.
        renderRelated(article) {
            const related = Articles.all()
                .filter((a) => a.id !== article.id && a.category.toLowerCase() === article.category.toLowerCase())
                .slice(0, 3);
            if (!related.length) {
                el.readerRelated.hidden = true;
                el.readerRelated.replaceChildren();
                return;
            }
            const frag = document.createDocumentFragment();
            const heading = document.createElement('p');
            heading.className = 'reader-related-heading';
            heading.textContent = t('relatedHeading', { cat: article.category });
            frag.appendChild(heading);
            related.forEach((a) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'reader-related-item';
                item.dataset.relatedId = a.id;
                const title = document.createElement('span');
                title.className = 'rr-title';
                title.textContent = a.title;
                const meta = document.createElement('span');
                meta.className = 'rr-meta';
                meta.textContent = `${a.author} • ${t('minRead', { n: num(a.readTime) })}`;
                item.append(title, meta);
                frag.appendChild(item);
            });
            el.readerRelated.replaceChildren(frag);
            el.readerRelated.hidden = false;
        },

        open(article) {
            this.fill(article);

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
            el.readerShareBtn.querySelector('span').textContent = t('share');
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
            el.readerShareBtn.querySelector('span').textContent = t('copied');
            Toast.show(t('toastCopied'), 'fa-link');
            setTimeout(() => this.resetShareBtn(), 2000);
        },
    };

    /* ================= Composer ================= */

    const DRAFT_FIELDS = ['postTitle', 'postAuthor', 'postCategory', 'postImage', 'postContent'];

    const Composer = {
        editingId: null,

        updateWordCount() {
            const words = countWords(el.postContent.value);
            const wordLabel = words === 1 ? t('wordsOne') : t('words', { n: num(words) });
            const readLabel = t('minRead', { n: num(estimateReadTime(el.postContent.value)) });
            el.wordCount.textContent = `${wordLabel} • ~${readLabel}`;
        },

        // Swap the dialog heading/submit label between "new" and "edit" modes.
        applyMode() {
            const editing = this.editingId !== null;
            el.modalTitle.textContent = t(editing ? 'editTitle' : 'draftTitle');
            el.publishBtn.textContent = t(editing ? 'update' : 'publish');
            // In edit mode "Save Draft" is irrelevant; hide it.
            el.saveDraftBtn.hidden = editing;
        },

        // Open blank (restoring any draft) for a new piece.
        openNew() {
            this.editingId = null;
            this.applyMode();
            openOverlay(el.writeModal, document.getElementById('postTitle'));
        },

        // Open pre-filled to edit one of the reader's own stories.
        openEdit(id) {
            const post = Articles.rawById(id);
            if (!post) return;
            this.editingId = id;
            document.getElementById('postTitle').value = post.title;
            document.getElementById('postAuthor').value = post.author;
            document.getElementById('postCategory').value = post.category;
            document.getElementById('postImage').value = post.image || '';
            document.getElementById('postContent').value = post.content;
            this.updateWordCount();
            this.applyMode();
            openOverlay(el.writeModal, document.getElementById('postTitle'));
        },

        saveDraft() {
            const draft = {};
            DRAFT_FIELDS.forEach((id) => { draft[id] = document.getElementById(id).value; });
            Store.write(KEYS.draft, draft);
            Toast.show(t('toastDraft'), 'fa-floppy-disk');
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
                image: document.getElementById('postImage').value.trim(),
                content: document.getElementById('postContent').value.trim(),
            };
            // Guard against whitespace-only submissions that slip past `required`.
            if (!fields.title || !fields.author || !fields.category || !fields.content) return;

            if (this.editingId !== null) {
                // Update in place; leave the current view/filters as they are.
                const article = Articles.update(this.editingId, fields);
                justPublishedId = null;
                this.editingId = null;
                el.articleForm.reset();
                this.updateWordCount();
                this.applyMode();
                closeOverlay(el.writeModal);
                renderFeed();
                // If the edited story is open in the reader, refresh it.
                if (article && el.readerModal.classList.contains('active') && Reader.currentId === article.id) {
                    Reader.fill(article);
                }
                Toast.show(t('toastUpdated'), 'fa-pen-to-square');
                return;
            }

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
            Toast.show(t('toastPublished'), 'fa-circle-check');
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
            el.backToTop.classList.toggle('visible', window.scrollY > 600);
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
        // If the deleted story is open in the reader, close it.
        if (el.readerModal.classList.contains('active') && Reader.currentId === id) {
            closeOverlay(el.readerModal);
        }
        renderFeed();
        Toast.show(t('toastDeleted'), 'fa-trash-can');
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
            const id = bookmarkBtn.closest('[data-id]').dataset.id;
            Bookmarks.toggle(id);
            Toast.show(Bookmarks.has(id) ? t('toastSaved') : t('toastUnsaved'),
                Bookmarks.has(id) ? 'fa-bookmark' : 'fa-circle-minus');
            renderFeed();
            return;
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            e.preventDefault();
            Composer.openEdit(editBtn.closest('[data-id]').dataset.id);
            return;
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            handleDelete(deleteBtn);
            return;
        }

        // Related stories live inside the reader dialog; handle before the guard.
        const relatedItem = e.target.closest('.reader-related-item');
        if (relatedItem) {
            e.preventDefault();
            const article = Articles.byId(relatedItem.dataset.relatedId);
            if (article) Reader.open(article); // replaces reader content + scrolls to top
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

    // Language (button appears in both the desktop nav and the drawer).
    el.langToggles.forEach((toggle) => toggle.addEventListener('click', () => {
        Drawer.close();
        I18n.toggle();
    }));

    // Mobile drawer.
    el.navToggle.addEventListener('click', () => (Drawer.isOpen() ? Drawer.close() : Drawer.open()));
    el.drawerCloseBtn.addEventListener('click', () => Drawer.close());
    el.drawerOverlay.addEventListener('click', () => Drawer.close());
    el.drawerWriteBtn.addEventListener('click', () => {
        Drawer.close();
        Composer.openNew();
    });

    // Overlays.
    el.openModalBtn.addEventListener('click', () => Composer.openNew());
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

    // Keyboard: Escape closes dialogs/drawer, "/" jumps to search, Tab is
    // trapped inside an open dialog for accessibility.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const open = document.querySelector('.modal-overlay.active');
            if (open) closeOverlay(open);
            else if (Drawer.isOpen()) Drawer.close();
            return;
        }
        if (e.key === 'Tab') {
            const open = document.querySelector('.modal-overlay.active');
            if (open) trapFocus(e, open);
            return;
        }
        if (e.key === '/' && !e.target.closest('input, textarea')) {
            e.preventDefault();
            el.searchInputs[0].focus();
        }
    });

    // Keep Tab focus cycling within the active dialog.
    function trapFocus(e, overlay) {
        const focusable = overlay.querySelectorAll(
            'a[href], button:not([disabled]):not([hidden]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const items = Array.from(focusable).filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // Composer.
    el.postContent.addEventListener('input', () => Composer.updateWordCount());
    el.articleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        Composer.publish();
    });

    // Back to top.
    el.backToTop.hidden = false; // visibility is handled via the .visible class
    el.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Progress bar (also toggles the back-to-top button).
    window.addEventListener('scroll', () => Progress.onScroll());

    /* ================= Init ================= */

    Theme.init();
    Composer.restoreDraft();
    Router.apply();    // read the hash first (before any render rewrites it)
    I18n.init();       // sets language/direction/fonts, then renders the resolved section
});
