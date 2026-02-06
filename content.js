// Content script to inject Torbox button into NexusMods mod pages

(function () {
  "use strict";

  let progressNotification = null;

  // Listen for progress updates from background script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "progressUpdate") {
      updateProgressNotification(message.status, message.message);
    }
  });

  // Main init function
  function init() {
    initModPageButton();
    initFileButtons();
  }

  // Initialize the main mod page Torbox button
  function initModPageButton() {
    const modActionsList = document.querySelector("ul.modactions");
    if (!modActionsList) {
      return;
    }

    // Check if button already exists
    if (document.getElementById("action-torbox")) {
      return;
    }

    // Find the manual download button to insert after it
    const manualButton = document.getElementById("action-manual");
    if (!manualButton) {
      return;
    }

    // Create the Torbox button
    const torboxButton = createTorboxButton();
    manualButton.insertAdjacentElement("afterend", torboxButton);
  }

  // Initialize Torbox buttons for individual files on the files tab
  function initFileButtons() {
    // Find all file accordions with data-id
    const fileEntries = document.querySelectorAll("dd[data-id]");

    fileEntries.forEach((fileEntry) => {
      const fileId = fileEntry.getAttribute("data-id");
      if (!fileId) return;

      // Find the accordion-downloads list within this file entry
      const downloadsList = fileEntry.querySelector("ul.accordion-downloads");
      if (!downloadsList) return;

      // Check if we already added a Torbox button to this file
      if (downloadsList.querySelector(".torbox-file-btn")) return;

      // Create and add the Torbox button
      const torboxLi = createFileButton(fileId);
      downloadsList.appendChild(torboxLi);
    });
  }

  function createTorboxButton() {
    const li = document.createElement("li");
    li.id = "action-torbox";

    const a = document.createElement("a");
    a.className = "btn inline-flex torbox-btn";
    a.tabIndex = 0;
    a.title = "Send to Torbox for download";

    a.appendChild(createTorboxIcon());

    const span = document.createElement("span");
    span.className = "flex-label";
    span.textContent = "Torbox";

    a.appendChild(span);
    li.appendChild(a);

    a.addEventListener("click", (e) => handleTorboxClick(e, null));

    return li;
  }

  function createFileButton(fileId) {
    const li = document.createElement("li");
    li.className = "torbox-file-btn-wrapper";

    const a = document.createElement("a");
    a.className = "btn inline-flex torbox-file-btn";
    a.tabIndex = 0;
    a.title = "Send this file to Torbox for download";
    a.dataset.fileId = fileId;

    a.appendChild(createTorboxIcon());

    const span = document.createElement("span");
    span.className = "flex-label";
    span.textContent = "Torbox";

    a.appendChild(span);
    li.appendChild(a);

    a.addEventListener("click", (e) => handleTorboxClick(e, fileId));

    return li;
  }

  function createTorboxIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon icon-torbox");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.innerHTML = `
      <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
    `;
    return svg;
  }

  async function handleTorboxClick(e, fileId) {
    e.preventDefault();

    const button = e.currentTarget;
    const originalContent = button.innerHTML;

    // Show loading state
    button.classList.add("torbox-loading");
    const labelEl = button.querySelector(".flex-label");
    if (labelEl) labelEl.textContent = "Sending...";

    // Create persistent progress notification
    showProgressNotification("Submitting to Torbox...");

    try {
      // Build the URL
      let modUrl;
      if (fileId) {
        // Build file-specific URL
        const baseUrl = window.location.origin + window.location.pathname;
        modUrl = `${baseUrl}?tab=files&file_id=${fileId}`;
      } else {
        modUrl = window.location.href;
      }

      // Get mod name from page title or header
      const modName = getModName(fileId);

      // Send message to background script
      const response = await browser.runtime.sendMessage({
        action: "submitToTorbox",
        link: modUrl,
        name: modName,
      });

      if (response.success) {
        hideProgressNotification();
        showNotification("Download complete! Opening file...", "success");
        if (labelEl) labelEl.textContent = "Done!";
        button.classList.remove("torbox-loading");
        button.classList.add("torbox-success");

        setTimeout(() => {
          button.innerHTML = originalContent;
          button.classList.remove("torbox-success");
        }, 3000);
      } else {
        throw new Error(response.error || "Unknown error occurred");
      }
    } catch (error) {
      hideProgressNotification();
      showNotification(`Error: ${error.message}`, "error");
      button.innerHTML = originalContent;
      button.classList.remove("torbox-loading");
      button.classList.add("torbox-error");

      setTimeout(() => {
        button.classList.remove("torbox-error");
      }, 3000);
    }
  }

  function getModName(fileId) {
    // If we have a fileId, try to get the filename from the file entry
    if (fileId) {
      const fileEntry = document.querySelector(`dd[data-id="${fileId}"]`);
      if (fileEntry) {
        // Try to get filename from the accordion header (dt element before this dd)
        const header = fileEntry.previousElementSibling;
        if (header && header.tagName === "DT") {
          const nameEl = header.querySelector(".file-expander-header h3, .name");
          if (nameEl) {
            return nameEl.textContent.trim();
          }
        }
        // Try to get from preview link
        const previewLink = fileEntry.querySelector("a.btn-ajax-content-preview");
        if (previewLink) {
          const url = previewLink.getAttribute("data-url");
          if (url) {
            return url;
          }
        }
      }
    }

    // Fallback: Try to get the mod name from the page
    const titleElement = document.querySelector("h1.mod-title");
    if (titleElement) {
      return titleElement.textContent.trim();
    }

    // Fallback to page title
    const pageTitle = document.title;
    if (pageTitle) {
      // Remove "at ... Nexus - Mods and Community" suffix
      return pageTitle.split(" at ")[0].trim();
    }

    return null;
  }

  function showProgressNotification(message) {
    hideProgressNotification();

    progressNotification = document.createElement("div");
    progressNotification.className = "torbox-progress-notification";
    progressNotification.innerHTML = `
      <div class="torbox-progress-spinner"></div>
      <span class="torbox-progress-text">${message}</span>
    `;

    document.body.appendChild(progressNotification);
    setTimeout(() => progressNotification.classList.add("show"), 10);
  }

  function updateProgressNotification(status, message) {
    if (progressNotification) {
      const textEl = progressNotification.querySelector(".torbox-progress-text");
      if (textEl) {
        textEl.textContent = message;
      }
    } else {
      showProgressNotification(message);
    }
  }

  function hideProgressNotification() {
    if (progressNotification) {
      progressNotification.classList.remove("show");
      setTimeout(() => {
        if (progressNotification) {
          progressNotification.remove();
          progressNotification = null;
        }
      }, 300);
    }
  }

  function showNotification(message, type) {
    // Remove any existing notifications
    const existing = document.querySelector(".torbox-notification");
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement("div");
    notification.className = `torbox-notification torbox-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add("show"), 10);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Also observe for dynamic content loading (files tab loads dynamically)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        init();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
