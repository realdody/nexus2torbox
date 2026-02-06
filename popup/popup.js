document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey");
  const saveBtn = document.getElementById("saveBtn");
  const statusDiv = document.getElementById("status");

  // Load existing API key
  const { torboxApiKey } = await browser.storage.local.get("torboxApiKey");
  if (torboxApiKey) {
    apiKeyInput.value = torboxApiKey;
  }

  saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus("Please enter an API key", "error");
      return;
    }

    try {
      await browser.storage.local.set({ torboxApiKey: apiKey });
      showStatus("API key saved successfully!", "success");
    } catch (error) {
      showStatus("Failed to save API key: " + error.message, "error");
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = "status " + type;

    setTimeout(() => {
      statusDiv.className = "status";
    }, 3000);
  }
});
