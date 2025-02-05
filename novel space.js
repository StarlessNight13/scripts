// ==UserScript==
// @name         Auto-Fetch Next Chapter with Notifications
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Auto-fetches the next chapter, keeps only 2 chapters visible, updates the URL only when the chapter is on-screen, and adds navigation buttons.
// @author       You
// @match        https://cenele.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    selectors: {
      nextLink: ".next_page",
      contentContainer: ".text-right",
      appendTo: ".reading-content",
      title: "#chapter-heading",
      content: ".text-left",
      removeElements: [
        ".social-share",
        ".entry-content_wrap > h2:nth-child(1)",
        ".chapter-warning",
        "div.row:nth-child(3)",
        ".footer-counter",
        ".read-container > h3:nth-child(3)",
        ".read-container > h3:nth-child(4)",
      ],
    },
    settings: {
      scrollThreshold: 900,
      notificationDuration: 3000,
      maxVisibleChapters: 2,
      initDelay: 2000,
      urlUpdateThreshold: 10, // Lowered threshold for testing
      debugMode: false, // Added debug mode
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

  class ChapterLoader {
    constructor() {
      this.isLoading = false;
      this.nextChapterUrl = "";
      this.nextChapterContentReady = null;
      this.nextChapterUrlReady = null;
      this.title = "";
      this.savedStyle = "";

      this.init();
      this.setupURLUpdates();
    }

    init() {
      try {
        this.removeElements();
        this.nextChapterUrl = this.getNextChapterUrl();
        this.createUrlData();

        setTimeout(() => {
          this.setupEventListeners();
          this.fetchNextChapter();
          this.getElementStyle();
        }, CONFIG.settings.initDelay);
      } catch (error) {
        console.error("Initialization error:", error);
      }
    }

    setupEventListeners() {
      window.addEventListener("scroll", this.handleScroll.bind(this));
    }

    removeElements() {
      CONFIG.selectors.removeElements.forEach((selector) => {
        document
          .querySelectorAll(selector)
          .forEach((element) => element.remove());
      });
    }

    showNotification(title) {
      const notification = document.createElement("div");
      notification.textContent = `New Chapter: ${title}`;
      Object.assign(notification.style, CONFIG.styles.notification);
      document.body.appendChild(notification);
      setTimeout(
        () => notification.remove(),
        CONFIG.settings.notificationDuration
      );
    }

    getElementStyle() {
      const element = document.querySelector(CONFIG.selectors.content);
      if (element) {
        this.savedStyle = element.getAttribute("style") || "";
      }
    }

    getNextChapterUrl() {
      const nextLink = document.querySelector(CONFIG.selectors.nextLink);
      return nextLink ? nextLink.href : null;
    }

    async fetchNextChapter() {
      if (!this.nextChapterUrl || this.isLoading) return;

      this.isLoading = true;
      try {
        const response = await fetch(this.nextChapterUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "text/html");

        const contentElement = doc.querySelector(
          CONFIG.selectors.contentContainer
        );
        if (!contentElement) {
          throw new Error("Content container not found");
        }

        // Get the next chapter's content and URL
        this.nextChapterContentReady = contentElement.innerHTML;
        this.title =
          doc.querySelector(CONFIG.selectors.title)?.textContent ||
          "Unknown Chapter";
        this.nextChapterUrlReady = doc.querySelector(
          CONFIG.selectors.nextLink
        )?.href;

        // Create and append the container first
        const container = document.createElement("div");
        container.classList.add("chapter-container");
        container.setAttribute("data-url", this.nextChapterUrl); // Use current nextChapterUrl
        container.innerHTML = this.nextChapterContentReady;

        if (this.savedStyle) {
          container.setAttribute("style", this.savedStyle);
          container.style.textAlign = "right";
        }

        const appendToElement = document.querySelector(
          CONFIG.selectors.appendTo
        );
        if (!appendToElement) {
          throw new Error("Append target not found");
        }

        appendToElement.appendChild(container);
        this.cleanupOldChapters();

        // Show notification and update nextChapterUrl for next fetch
        this.showNotification(this.title);
        this.nextChapterUrl = this.nextChapterUrlReady;
      } catch (error) {
        console.error("Error fetching next chapter:", error);
        this.showNotification("Error loading next chapter");
      } finally {
        this.isLoading = false;
      }
    }

    cleanupOldChapters() {
      const chapters = document.querySelectorAll(".chapter-container");
      if (chapters.length > CONFIG.settings.maxVisibleChapters) {
        chapters[0].remove();
      }
    }

    handleScroll() {
      if (this.isLoading) return;

      const scrollPosition = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const endThreshold = documentHeight - CONFIG.settings.scrollThreshold;

      if (scrollPosition >= endThreshold) {
        this.fetchNextChapter();
      }

      this.updateURLWithVisibleChapter();
    }
    updateURLWithVisibleChapter() {
      const readingContent = document.querySelector(CONFIG.selectors.appendTo);
      if (!readingContent) {
        if (CONFIG.settings.debugMode) console.log("Reading content not found");
        return;
      }

      const chapters = Array.from(readingContent.children);
      if (CONFIG.settings.debugMode) {
        console.log("Found chapters:", chapters.length);
        chapters.forEach((chapter) => {
          console.log("Chapter URL:", chapter.getAttribute("data-url"));
        });
      }

      let mostVisibleChapter = null;
      let maxVisiblePercentage = 0;

      // Get viewport dimensions
      const viewportHeight = window.innerHeight;
      const scrollTop = window.scrollY;

      chapters.forEach((chapter) => {
        const rect = chapter.getBoundingClientRect();

        // Calculate visibility
        const totalHeight = rect.height;
        const visibleHeight =
          Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);

        let visiblePercentage =
          (visibleHeight / Math.min(totalHeight, viewportHeight)) * 100;
        visiblePercentage = Math.max(0, visiblePercentage);

        if (CONFIG.settings.debugMode) {
          console.log("Chapter visibility:", {
            url: chapter.getAttribute("data-url"),
            visibleHeight,
            totalHeight,
            visiblePercentage,
            viewportPosition: rect.top,
          });
        }

        // Simple visibility check - if more than threshold is visible
        if (visiblePercentage > maxVisiblePercentage) {
          maxVisiblePercentage = visiblePercentage;
          mostVisibleChapter = chapter;
        }
      });

      if (
        mostVisibleChapter &&
        maxVisiblePercentage > CONFIG.settings.urlUpdateThreshold
      ) {
        const chapterUrl = mostVisibleChapter.getAttribute("data-url");
        if (CONFIG.settings.debugMode) {
          console.log("Updating URL:", {
            currentUrl: window.location.href,
            newUrl: chapterUrl,
            visibility: maxVisiblePercentage,
          });
        }

        if (chapterUrl && window.location.href !== chapterUrl) {
          history.replaceState({ chapterUrl: chapterUrl }, "", chapterUrl);
        }
      }
    }

    // Update the createUrlData method to ensure initial chapter has URL
    createUrlData() {
      const currentElement = document.querySelector(CONFIG.selectors.content);
      if (currentElement) {
        const currentUrl = window.location.href;
        currentElement.setAttribute("data-url", currentUrl);

        // Also set it on the parent container if it exists
        const container =
          currentElement.closest(".chapter-container") ||
          currentElement.parentElement;
        if (container) {
          container.setAttribute("data-url", currentUrl);
        }

        if (CONFIG.settings.debugMode) {
          console.log("Set initial URL:", currentUrl);
        }
      }
    }
    // Update the setupURLUpdates method for more frequent updates
    setupURLUpdates() {
      // Check URL on scroll with less aggressive debouncing
      window.addEventListener(
        "scroll",
        this.debounce(() => {
          this.updateURLWithVisibleChapter();
        }, 50)
      ); // Reduced from 100ms to 50ms

      // Also check periodically
      setInterval(() => {
        this.updateURLWithVisibleChapter();
      }, 1000);
    }

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    createUrlData() {
      const currentElement = document.querySelector(CONFIG.selectors.content);
      if (currentElement) {
        currentElement.setAttribute("data-url", window.location.href);
      }
    }
  }

  // Initialize the chapter loader
  new ChapterLoader();
})();
