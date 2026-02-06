// Background script for handling Torbox API calls

const TORBOX_API_BASE = "https://api.torbox.app/v1/api";
const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_ATTEMPTS = 200; // ~10 minutes max wait

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "submitToTorbox") {
    handleTorboxSubmit(message.link, message.name, sender.tab.id)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === "getApiKey") {
    browser.storage.local
      .get("torboxApiKey")
      .then((result) => sendResponse({ apiKey: result.torboxApiKey || null }))
      .catch((error) => sendResponse({ apiKey: null, error: error.message }));
    return true;
  }
});

async function handleTorboxSubmit(link, name, tabId) {
  const { torboxApiKey } = await browser.storage.local.get("torboxApiKey");

  if (!torboxApiKey) {
    throw new Error(
      "Torbox API key not configured. Click the extension icon to set it up."
    );
  }

  // Step 1: Create the web download
  const formData = new FormData();
  formData.append("link", link);
  if (name) {
    formData.append("name", name);
  }

  const createResponse = await fetch(
    `${TORBOX_API_BASE}/webdl/createwebdownload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${torboxApiKey}`,
      },
      body: formData,
    }
  );

  const createData = await createResponse.json();

  if (!createResponse.ok) {
    throw new Error(
      createData.detail || createData.error || "Failed to submit to Torbox"
    );
  }

  const webId = createData.data?.webdownload_id || createData.data?.id;

  if (!webId) {
    throw new Error("No web download ID returned from Torbox");
  }

  // Notify content script that download was created
  sendProgressUpdate(tabId, "queued", "Download queued, waiting for processing...");

  // Step 2: Poll for completion
  const downloadInfo = await pollForCompletion(torboxApiKey, webId, tabId);

  // Step 3: Get download link and open it
  const downloadUrl = await getDownloadLink(
    torboxApiKey,
    webId,
    downloadInfo.fileId
  );

  // Open the download in a new tab
  browser.tabs.create({ url: downloadUrl });

  return { success: true, data: createData };
}

async function pollForCompletion(apiKey, webId, tabId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(
      `${TORBOX_API_BASE}/webdl/mylist?bypass_cache=true`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to check download status");
    }

    const data = await response.json();
    const downloads = data.data || [];

    // Find our download
    const download = downloads.find((d) => d.id === webId);

    if (!download) {
      throw new Error("Download not found in Torbox");
    }

    // Check download status
    const status = download.download_state || download.status;
    const progress = download.progress || 0;

    sendProgressUpdate(
      tabId,
      status,
      `Status: ${status} (${Math.round(progress * 100)}%)`
    );

    // Check if download is complete
    // Common statuses: "downloading", "completed", "ready", "cached", "error"
    if (
      status === "completed" ||
      status === "ready" ||
      status === "cached" ||
      status === "done" ||
      progress >= 1
    ) {
      // Get file ID - usually the first file or a specific field
      const fileId = download.files?.[0]?.id || download.file_id || 0;
      return { download, fileId };
    }

    if (status === "error" || status === "failed") {
      throw new Error(`Download failed: ${download.error || "Unknown error"}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error("Download timed out - check Torbox dashboard");
}

async function getDownloadLink(apiKey, webId, fileId) {
  const params = new URLSearchParams({
    token: apiKey,
    web_id: webId.toString(),
    file_id: fileId.toString(),
    zip_link: "false",
  });

  const response = await fetch(
    `${TORBOX_API_BASE}/webdl/requestdl?${params.toString()}`
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || data.error || "Failed to get download link");
  }

  const data = await response.json();
  return data.data || data.url || data.download_url;
}

function sendProgressUpdate(tabId, status, message) {
  if (tabId) {
    browser.tabs.sendMessage(tabId, {
      action: "progressUpdate",
      status,
      message,
    }).catch(() => {
      // Tab may have been closed, ignore error
    });
  }
}
