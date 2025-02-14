// ==UserScript==
// @name         KolNovel Auto-Fetcher
// @namespace    https://github.com/DarklessNight
// @version      2025-02-12
// @description  Auto-fetch and display next chapters on KolNovel
// @author       DarklessNight
// @match        https://kolnovel.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kolnovel.org
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/StarlessNight13/scripts/refs/heads/main/kolnovel.js
// @updateURL    https://raw.githubusercontent.com/StarlessNight13/scripts/refs/heads/main/kolnovel.js
// ==/UserScript==



(function () {
    "use strict";

    // Configuration object with all settings and selectors
    const CONFIG = {
        selectors: {
            nextLink:
            ".naveps > div:nth-child(1) > div:nth-child(1) > a:nth-child(1)",
            contentContainer: ".epwrapper",
            appendTo: ".epwrapper",
            title: ".cat-series",
            content: "#kol_content",
            removeElements: [
                ".socialts",
                "div.announ:nth-child(4)",
                "div.announ:nth-child(1)",
                ".wp-embedded-content",
                "div.bixbox.fullrelated",
                "div.bixbox:has( > .commentx)",
                "#footer",
            ],
        },
        cleanupRules: {
            textToRemove: [
                "*إقرأ* رواياتنا* فقط* على* مو*قع م*لوك الرو*ايات ko*lno*vel ko*lno*vel. com",
            ],
        },
        settings: {
            scrollThreshold: 900,
            notificationDuration: 3000,
            maxVisibleChapters: 2,
            initDelay: 2000,
            urlUpdateThreshold: 10,
            debugMode: false,
        },
        styles: {
            notification: {
                position: "fixed",
                top: "10px",
                right: "10px",
                background: "#28a745",
                color: "#fff",
                padding: "10px",
                borderRadius: "5px",
                zIndex: 1000,
            },
        },
    };

    // Utility class for DOM operations
    class DOMUtils {
        static removeElements(doc, selectors) {
            selectors.forEach((selector) => {
                doc.querySelectorAll(selector).forEach((element) => element.remove());
            });
        }

        static getNextChapterUrl(doc) {
            const nextLink = doc.querySelector(CONFIG.selectors.nextLink);
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

    // Class for handling notifications
    class NotificationManager {
        static show(message) {
            const notification = document.createElement("div");
            notification.textContent = message;
            Object.assign(notification.style, CONFIG.styles.notification);
            document.body.appendChild(notification);

            setTimeout(
                () => notification.remove(),
                CONFIG.settings.notificationDuration
            );
        }
    }

    // Class for handling URL updates
    class URLManager {
        constructor() {
            this.setupURLUpdates();
        }

        updateURL(chapter) {
            if (!chapter) return;

            const chapterUrl = chapter.getAttribute("data-url");
            if (chapterUrl && window.location.href !== chapterUrl) {
                history.replaceState({ chapterUrl }, "", chapterUrl);
            }
        }

        findMostVisibleChapter() {
            const readingContent = document.querySelector(CONFIG.selectors.appendTo);
            if (!readingContent) return null;

            const chapters = Array.from(readingContent.children);
            const viewportHeight = window.innerHeight;

            let mostVisibleChapter = null;
            let maxVisiblePercentage = 0;

            chapters.forEach((chapter) => {
                const rect = chapter.getBoundingClientRect();
                const visibleHeight =
                      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
                const visiblePercentage =
                      (visibleHeight / Math.min(rect.height, viewportHeight)) * 100;

                if (visiblePercentage > maxVisiblePercentage) {
                    maxVisiblePercentage = visiblePercentage;
                    mostVisibleChapter = chapter;
                }
            });

            return maxVisiblePercentage > CONFIG.settings.urlUpdateThreshold
                ? mostVisibleChapter
            : null;
        }

        setupURLUpdates() {
            const updateURL = () => {
                const mostVisibleChapter = this.findMostVisibleChapter();
                this.updateURL(mostVisibleChapter);
            };

            window.addEventListener("scroll", this.debounce(updateURL, 50));
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

    // Class for handling chapter content
    class ChapterContentManager {
        constructor() {
            this.savedStyle = "";
        }

        getElementStyle() {
            const element = document.querySelector(CONFIG.selectors.content);
            if (element) {
                this.savedStyle = element.getAttribute("style") || "";
            }
        }

        cleanContent(content, linesToRemove) {
            if (!content) return "";

            let cleanedContent = content;
            linesToRemove.forEach((line) => {
                const escapedLine = line.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
                const regex = new RegExp(`^${escapedLine}$`, "gm");
                cleanedContent = cleanedContent.replace(regex, "");
            });

            return cleanedContent;
        }

        removeParagraphsWithoutStrong(container) {
            if (!container) return;

            container.querySelectorAll("p").forEach((p) => {
                if (!p.querySelector("strong")) {
                    p.remove();
                }
            });
        }

        createChapterContainer(content, url) {
            const container = document.createElement("div");
            container.classList.add("chapter-container");
            container.setAttribute("data-url", url);
            container.innerHTML = content;

            if (this.savedStyle) {
                container.setAttribute("style", this.savedStyle);
                container.style.textAlign = "right";
            }

            return container;
        }
    }

    // Main chapter loader class
    class ChapterLoader {
        constructor() {
            this.isLoading = false;
            this.nextChapterUrl = "";
            this.contentManager = new ChapterContentManager();
            this.urlManager = new URLManager();

            this.init();
        }

        async init() {
            try {
                DOMUtils.removeElements(document, CONFIG.selectors.removeElements);
                this.nextChapterUrl = DOMUtils.getNextChapterUrl(document);
                this.initializeCurrentChapter();

                setTimeout(() => {
                    this.setupEventListeners();
                    this.fetchNextChapter();
                    this.contentManager.getElementStyle();
                }, CONFIG.settings.initDelay);
            } catch (error) {
                console.error("Initialization error:", error);
            }
        }

        initializeCurrentChapter() {
            const currentElement = document.querySelector(CONFIG.selectors.content);
            if (currentElement) {
                const currentUrl = window.location.href;
                currentElement.setAttribute("data-url", currentUrl);
            }
        }

        setupEventListeners() {
            window.addEventListener("scroll", this.handleScroll.bind(this));
        }

        handleScroll() {
            if (this.isLoading) return;

            const scrollPosition = window.scrollY + window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const endThreshold = documentHeight - CONFIG.settings.scrollThreshold;

            if (scrollPosition >= endThreshold) {
                this.fetchNextChapter();
            }
        }

        async fetchNextChapter() {
            if (!this.nextChapterUrl || this.isLoading) return;

            this.isLoading = true;

            try {
                const response = await fetch(this.nextChapterUrl);
                if (!response.ok)
                    throw new Error(`HTTP error! status: ${response.status}`);

                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, "text/html");

                const content = await this.processChapterContent(doc);
                await this.appendChapter(content);

                this.nextChapterUrl = DOMUtils.getNextChapterUrl(doc);

                const title =
                      doc.querySelector(CONFIG.selectors.title)?.textContent ||
                      "Unknown Chapter";
                NotificationManager.show(`New Chapter: ${title}`);
            } catch (error) {
                console.error("Error fetching next chapter:", error);
                NotificationManager.show("Error loading next chapter");
            } finally {
                this.isLoading = false;
            }
        }

        async processChapterContent(doc) {
            const contentElement = doc.querySelector(CONFIG.selectors.content);
            if (!contentElement) throw new Error("Content container not found");

            const classesToRemove = DOMUtils.extractClassesFromStyle(
                doc,
                "article > style:nth-child(2)"
            );
            classesToRemove.forEach((className) => {
                contentElement
                    .querySelectorAll(`.${className}`)
                    .forEach((el) => el.remove());
            });

            return contentElement.innerHTML;
        }

        async appendChapter(content) {
            const container = this.contentManager.createChapterContainer(
                content,
                this.nextChapterUrl
            );
            const appendToElement = document.querySelector(CONFIG.selectors.appendTo);

            if (!appendToElement) throw new Error("Append target not found");

            appendToElement.appendChild(container);
            this.cleanupOldChapters();
        }

        cleanupOldChapters() {
            const chapters = document.querySelectorAll(".chapter-container");
            if (chapters.length > CONFIG.settings.maxVisibleChapters) {
                chapters[0].remove();
            }
        }
    }

    // Initialize the application
    new ChapterLoader();
})();
