// ==UserScript==
// @name         Universal Chapter Auto-Loader
// @namespace    http://darkless.org/
// @version      1.3
// @description  Auto-fetches next chapters for various novel reading sites with toggle, state saving, стилизация chapters from local storage and user options
// @author       Darklessnight 
// @match        https://cenele.com/*
// @match        https://kolnovel.org/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- Default Chapter Style Configuration ---
    const DEFAULT_CHAPTER_STYLE_CONFIG = {
        "fontSize": "16px",
        "fontFamily": "'Noto Kufi Arabic', sans-serif",
        "lineHeight": "200%",
        "background": "transparent"
    };

    // --- Load Chapter Style from Local Storage ---
    const localStorageStyleKey = 'ts_rs_cfg';
    let currentChapterStyleConfig = DEFAULT_CHAPTER_STYLE_CONFIG; // Default style
    const storedStyleConfig = localStorage.getItem(localStorageStyleKey);

    if (storedStyleConfig) {
        try {
            currentChapterStyleConfig = JSON.parse(storedStyleConfig);
        } catch (e) {
            console.error('Error parsing stored style config, using default:', e);
            currentChapterStyleConfig = DEFAULT_CHAPTER_STYLE_CONFIG; // Fallback to default on parse error
        }
    } else {
        console.log('No stored style config found, using default.');
    }

    // --- State Management ---
    let autoLoaderEnabled = true; // Default state is ON
    const localStorageKey = 'autoLoaderEnabled';

    // Load state from local storage
    const storedState = localStorage.getItem(localStorageKey);
    if (storedState !== null) {
        autoLoaderEnabled = (storedState === 'true');
    }

    // Function to save state to local storage
    function saveAutoLoaderState() {
        localStorage.setItem(localStorageKey, autoLoaderEnabled);
    }

    // --- Button Creation ---
    const toggleButton = document.createElement('button');
    toggleButton.style.position = 'relative'; // Modified: position relative for inside .optx-content
    toggleButton.style.display = 'block'; // Added: display block to take full width if needed
    toggleButton.style.marginTop = '10px'; // Modified: margin top instead of fixed top
    toggleButton.style.marginLeft = '10px'; // Modified: margin left instead of fixed left
    toggleButton.style.zIndex = '1001'; // Ensure it's on top of notifications
    toggleButton.style.padding = '5px 10px';
    toggleButton.style.backgroundColor = autoLoaderEnabled ? '#4CAF50' : '#f44336'; // Green for ON, Red for OFF
    toggleButton.style.color = 'white';
    toggleButton.style.border = 'none';
    toggleButton.style.borderRadius = '5px';
    toggleButton.style.cursor = 'pointer';
    toggleButton.textContent = 'Auto-Loader: ' + (autoLoaderEnabled ? 'ON' : 'OFF');

    // --- Append Button to .optx-content ---
    const optxContent = document.querySelector('.optx-content');
    if (optxContent) {
        optxContent.appendChild(toggleButton);
    } else {
        console.warn('.optx-content element not found. Appending toggle button to document.body.');
        document.body.appendChild(toggleButton); // Fallback to body if .optx-content is not found
    }

    // --- Button Event Listener ---
    toggleButton.addEventListener('click', function () {
        autoLoaderEnabled = !autoLoaderEnabled;
        toggleButton.textContent = 'Auto-Loader: ' + (autoLoaderEnabled ? 'ON' : 'OFF');
        toggleButton.style.backgroundColor = autoLoaderEnabled ? '#4CAF50' : '#f44336';
        saveAutoLoaderState(); // Save the toggled state
        if (autoLoaderEnabled) {
            NotificationManager.show('Auto-Loader Enabled');
            if (!chapterLoaderInstance) { // Re-initialize if it was disabled and now enabled
                chapterLoaderInstance = isChapterPage(); // re-initialize if needed, capture instance
            }
        } else {
            NotificationManager.show('Auto-Loader Disabled');
            if (chapterLoaderInstance) {
                // Optionally stop any ongoing processes or clean up if needed.
                chapterLoaderInstance = null; // Prevent further loading if disabled, clear instance
            }
        }
    });

    // Site-specific configurations (rest of your code remains the same)
    const SITE_CONFIGS = {
        'cenele.com': {
            selectors: {
                nextLink: '.next_page',
                contentContainer: '.text-right',
                appendTo: '.reading-content',
                title: '#chapter-heading',
                content: '.text-left',
                removeElements: [
                    '.social-share',
                    '.entry-content_wrap > h2:nth-child(1)',
                    '.chapter-warning',
                    'div.row:nth-child(3)',
                    '.footer-counter',
                    '.read-container > h3:nth-child(3)',
                    '.read-container > h3:nth-child(4)',
                ]
            }
        },
        'kolnovel.org': {
            selectors: {
                nextLink: '.naveps > div:nth-child(1) > div:nth-child(1) > a:nth-child(1)',
                contentContainer: '.epwrapper',
                appendTo: '.epwrapper',
                title: '.cat-series',
                content: '#kol_content',
                removeElements: [
                    '.socialts',
                    'div.announ:nth-child(4)',
                    'div.announ:nth-child(1)',
                    '.wp-embedded-content',
                    'div.bixbox.fullrelated',
                    'div.bixbox:has( > .commentx)',
                    '#footer',
                ]
            },
            condintions: {
                selectors: [
                    '#kol_content',
                    '.naveps > div:nth-child(1) > div:nth-child(1) > a:nth-child(1)'
                ]
            }
        }
    };

    // Universal configuration (rest of your code remains the same)
    const UNIVERSAL_CONFIG = {
        settings: {
            scrollThreshold: 900,
            notificationDuration: 3000,
            maxVisibleChapters: 2,
            initDelay: 2000,
            urlUpdateThreshold: 10,
            debugMode: false
        },
        styles: {
            notification: {
                position: 'fixed',
                top: '10px',
                right: '10px',
                background: '#28a745',
                color: '#fff',
                padding: '10px',
                borderRadius: '5px',
                zIndex: 1000
            }
        }
    };

    // DOMUtils, NotificationManager, URLManager, checkConds are unchanged
    class DOMUtils {
        static removeElements(doc, selectors) {
            selectors.forEach(selector => {
                doc.querySelectorAll(selector).forEach(element => element.remove());
            });
        }

        static getNextChapterUrl(doc, selector) {
            const nextLink = doc.querySelector(selector);
            return nextLink ? nextLink.href : null;
        }

        static extractClassesFromStyle(doc, selector) {
            const styleElement = doc.querySelector(selector);
            if (!styleElement) return [];

            const cssText = styleElement.textContent;
            const classNames = new Set();
            const regex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
            let match;
            while ((match = regex.exec(cssText))) {
                classNames.add(match[1]);
            }
            return Array.from(classNames);
        }
    }

    class NotificationManager {
        static show(message) {
            const notification = document.createElement('div');
            notification.textContent = message;
            Object.assign(notification.style, UNIVERSAL_CONFIG.styles.notification);
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), UNIVERSAL_CONFIG.settings.notificationDuration);
        }
    }

    class URLManager {
        constructor(config) {
            this.config = config;
            this.setupURLUpdates();
        }

        updateURL(chapter) {
            if (!chapter) return;
            const chapterUrl = chapter.getAttribute('data-url');
            if (chapterUrl && window.location.href !== chapterUrl) {
                history.replaceState({ chapterUrl }, '', chapterUrl);
            }
        }

        findMostVisibleChapter() {
            const readingContent = document.querySelector(this.config.selectors.appendTo);
            if (!readingContent) return null;

            const chapters = Array.from(readingContent.children);
            const viewportHeight = window.innerHeight;
            let mostVisibleChapter = null;
            let maxVisiblePercentage = 0;

            chapters.forEach(chapter => {
                const rect = chapter.getBoundingClientRect();
                const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
                const visiblePercentage = (visibleHeight / Math.min(rect.height, viewportHeight)) * 100;

                if (visiblePercentage > maxVisiblePercentage) {
                    maxVisiblePercentage = visiblePercentage;
                    mostVisibleChapter = chapter;
                }
            });

            return maxVisiblePercentage > UNIVERSAL_CONFIG.settings.urlUpdateThreshold ? mostVisibleChapter : null;
        }

        setupURLUpdates() {
            const updateURL = () => {
                const mostVisibleChapter = this.findMostVisibleChapter();
                this.updateURL(mostVisibleChapter);
            };

            window.addEventListener('scroll', this.debounce(updateURL, 50));
            setInterval(updateURL, 1000);
        }

        debounce(func, wait) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => func(...args), wait);
            };
        }
    }

    class ChapterContentManager {
        constructor(config) {
            this.config = config;
        }


        createChapterContainer(content, url) {
            const container = document.createElement('div');
            container.classList.add('chapter-container');
            container.setAttribute('data-url', url);
            container.innerHTML = content;

            // Apply current styles (from local storage or default)
            Object.assign(container.style, currentChapterStyleConfig);


            return container;
        }
    }

    class ChapterLoader {
        constructor() {
            const hostname = window.location.hostname;
            this.config = SITE_CONFIGS[hostname];

            if (!this.config) {
                console.error('Site configuration not found for:', hostname);
                return;
            }

            this.isLoading = false;
            this.nextChapterUrl = '';
            this.currentChapterNumber = 1; // Initialize chapter number counter
            this.contentManager = new ChapterContentManager(this.config);
            this.urlManager = new URLManager(this.config);

            this.init();
        }

        async init() {
            try {
                DOMUtils.removeElements(document, this.config.selectors.removeElements);
                this.nextChapterUrl = DOMUtils.getNextChapterUrl(document, this.config.selectors.nextLink);
                this.initializeCurrentChapter();

                setTimeout(() => {
                    this.setupEventListeners();
                    this.fetchNextChapter();
                    // Removed getElementStyle call
                    // this.contentManager.getElementStyle();
                }, UNIVERSAL_CONFIG.settings.initDelay);
            } catch (error) {
                console.error('Initialization error:', error);
            }
        }

        initializeCurrentChapter() {
            const currentElement = document.querySelector(this.config.selectors.content);
            if (currentElement) {
                currentElement.setAttribute('data-url', window.location.href);
            }
        }

        setupEventListeners() {
            window.addEventListener('scroll', this.handleScroll.bind(this));
        }

        handleScroll() {
            if (this.isLoading) return;

            const scrollPosition = window.scrollY + window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const endThreshold = documentHeight - UNIVERSAL_CONFIG.settings.scrollThreshold;

            if (scrollPosition >= endThreshold) {
                this.fetchNextChapter();
            }
        }

        async fetchNextChapter() {
            if (!this.nextChapterUrl || this.isLoading) return;

            this.isLoading = true;

            try {
                const response = await fetch(this.nextChapterUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');

                const content = await this.processChapterContent(doc);
                await this.appendChapter(content, this.nextChapterUrl, ++this.currentChapterNumber); // Increment chapter number

                this.nextChapterUrl = DOMUtils.getNextChapterUrl(doc, this.config.selectors.nextLink);

                const title = doc.querySelector(this.config.selectors.title)?.textContent || 'Unknown Chapter';
                NotificationManager.show(`New Chapter: ${title}`);
            } catch (error) {
                console.error('Error fetching next chapter:', error);
                NotificationManager.show('Error loading next chapter');
            } finally {
                this.isLoading = false;
            }
        }

        async processChapterContent(doc) {
            const containerElement = doc.querySelector(this.config.selectors.contentContainer);
            if (!containerElement) throw new Error('Content container not found');

            if (window.location.hostname === 'kolnovel.org') {
                const classesToRemove = DOMUtils.extractClassesFromStyle(doc, 'article > style:nth-child(2)');
                classesToRemove.forEach(className => {
                    containerElement.querySelectorAll(`.${className}`).forEach(el => el.remove());
                });
            }
            const contentElement = containerElement.querySelector(this.config.selectors.content)
            return contentElement.innerHTML;
        }

        async appendChapter(content, chapterUrl, chapterNumber) {
            const container = this.contentManager.createChapterContainer(content, chapterUrl);
            const appendToElement = document.querySelector(this.config.selectors.appendTo);

            if (!appendToElement) throw new Error('Append target not found');

            appendToElement.appendChild(container);

            // --- Create User Options Div ---
            const userOptionsDiv = document.createElement('div');
            userOptionsDiv.classList.add('chapter-user-options');
            userOptionsDiv.style.marginTop = '10px';
            userOptionsDiv.style.marginBottom = '20px';
            userOptionsDiv.style.textAlign = 'center';

            // --- Next Chapter Link ---
            const nextChapterLink = document.createElement('a');
            nextChapterLink.href = this.nextChapterUrl;
            nextChapterLink.textContent = `Go to Chapter ${chapterNumber + 1}`; // Display next chapter number
            nextChapterLink.style.marginRight = '15px';
            if (!this.nextChapterUrl) {
                nextChapterLink.style.color = 'grey'; // Grey out if no next chapter
                nextChapterLink.style.pointerEvents = 'none'; // Disable click if no next chapter
            }

            // --- Optxshds Button ---
            const optxshdsButton = document.createElement('button');
            optxshdsButton.textContent = 'Settings';
            optxshdsButton.style.padding = '5px 10px';
            optxshdsButton.addEventListener('click', function () {
                const optxshdElement = document.querySelector('.optxshd');
                if (optxshdElement) {
                    optxshdElement.classList.toggle('optxshds');
                } else {
                    console.warn('.optxshd element not found.');
                }
            });

            userOptionsDiv.appendChild(nextChapterLink);
            userOptionsDiv.appendChild(optxshdsButton);
            appendToElement.appendChild(userOptionsDiv); // Append user options after chapter

            this.cleanupOldChapters();
        }

        cleanupOldChapters() {
            const chapters = document.querySelectorAll('.chapter-container');
            if (chapters.length > UNIVERSAL_CONFIG.settings.maxVisibleChapters) {
                chapters[0].remove();
            }
        }
    }

    function checkConds(selectors) {
        const params = new URLSearchParams(window.location.search);
        const isDisabled = params.has("disabled") && params.get("disabled") === "true";
        if (isDisabled) return false;
        let missing = false;
        selectors.map((selector) => {
            const e = document.querySelector(selector)
            if (!e) missing = true
        })
        return !missing
    }
    let chapterLoaderInstance = null; // Keep track of ChapterLoader instance

    function isChapterPage() {
        const hostname = window.location.hostname;
        const config = SITE_CONFIGS[hostname];
        const cons = config.condintions.selectors;

        if (checkConds(cons)) {
            return new ChapterLoader(); // Return the instance
        } else {
            return null; // Return null if not a chapter page
        }
    }

    // Initialize the application only if enabled
    if (autoLoaderEnabled) {
        chapterLoaderInstance = isChapterPage(); // Capture the instance
    }
})();
