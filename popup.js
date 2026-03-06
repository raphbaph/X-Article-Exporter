const exportButton = document.getElementById("export-btn");
const statusNode = document.getElementById("status");

function setStatus(message, state = "idle") {
  statusNode.textContent = message;
  statusNode.dataset.state = state;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return tab;
}

async function exportArticle() {
  exportButton.disabled = true;
  setStatus("Reading the current page and converting it to Markdown...", "idle");

  try {
    const tab = await getActiveTab();

    if (!tab.url || !/^https:\/\/(x|twitter)\.com\//.test(tab.url)) {
      throw new Error("Open a published X Article on x.com before exporting.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXPORT_X_ARTICLE",
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not export this page.");
    }

    const downloadResponse = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_MARKDOWN",
      filename: response.filename,
      markdown: response.markdown,
    });

    if (!downloadResponse?.ok) {
      throw new Error(downloadResponse?.error || "Download failed.");
    }

    setStatus(
      `Saved ${downloadResponse.filename} to your default downloads folder.`,
      "success"
    );
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
  } finally {
    exportButton.disabled = false;
  }
}

exportButton.addEventListener("click", exportArticle);
