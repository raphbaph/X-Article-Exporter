chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DOWNLOAD_MARKDOWN") {
    return false;
  }

  const filename = sanitizeFilename(message.filename || "x-article.md");
  const markdown = typeof message.markdown === "string" ? message.markdown : "";

  chrome.downloads.download(
    {
      url: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
      filename,
      saveAs: true,
      conflictAction: "uniquify",
    },
    (downloadId) => {
      if (chrome.runtime.lastError || typeof downloadId !== "number") {
        sendResponse({
          ok: false,
          error:
            chrome.runtime.lastError?.message || "Chrome refused the download.",
        });
        return;
      }

      sendResponse({
        ok: true,
        downloadId,
        filename,
      });
    }
  );

  return true;
});

function sanitizeFilename(filename) {
  const normalized = String(filename)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "x-article.md";
  }

  return normalized.toLowerCase().endsWith(".md") ? normalized : `${normalized}.md`;
}
