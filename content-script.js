chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "EXPORT_X_ARTICLE") {
    return false;
  }

  try {
    const articleData = extractArticle();
    sendResponse({
      ok: true,
      filename: articleData.filename,
      markdown: articleData.markdown,
    });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error.message || "Could not extract the article.",
    });
  }

  return false;
});

function extractArticle() {
  if (!isLikelyArticlePage()) {
    throw new Error("This does not look like a published X Article page.");
  }

  const title = getArticleTitle();
  const contentRoot = findContentRoot(title);

  if (!contentRoot) {
    throw new Error("Could not find the article body on this page.");
  }

  const metadata = {
    title,
    author: getArticleAuthor(),
    publishedAt: getPublishedAt(),
    source: window.location.href,
  };

  const bodyMarkdown = elementToMarkdown(contentRoot)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!bodyMarkdown) {
    throw new Error("The article body appears to be empty.");
  }

  const markdown = buildMarkdown(metadata, bodyMarkdown);

  return {
    filename: buildFilename(metadata),
    markdown,
  };
}

function isLikelyArticlePage() {
  const pathname = window.location.pathname;
  const urlHint = /\/(i\/articles|articles)\//.test(pathname);
  const titleHint = document.querySelector('meta[property="og:type"][content="article"]');
  const articleHint = document.querySelector("main article, article");

  return Boolean(urlHint || titleHint || articleHint);
}

function getArticleTitle() {
  const candidates = [
    document.querySelector('meta[property="og:title"]')?.content,
    document.querySelector('meta[name="twitter:title"]')?.content,
    document.querySelector("main h1")?.textContent,
    document.querySelector("h1")?.textContent,
    document.title,
  ];

  for (const candidate of candidates) {
    const cleaned = cleanText(candidate);
    if (cleaned) {
      return cleaned.replace(/\s*\/\s*X\s*$/i, "");
    }
  }

  throw new Error("Could not determine the article title.");
}

function getArticleAuthor() {
  const metaAuthor = cleanText(document.querySelector('meta[name="author"]')?.content);
  if (metaAuthor) {
    return metaAuthor;
  }

  const pathnameParts = window.location.pathname.split("/").filter(Boolean);
  const username = pathnameParts.find((part) => !["i", "articles"].includes(part));
  return username ? `@${username}` : "Unknown";
}

function getPublishedAt() {
  const candidates = [
    document.querySelector('meta[property="article:published_time"]')?.content,
    document.querySelector("time")?.getAttribute("datetime"),
  ];

  return candidates.map(cleanText).find(Boolean) || "";
}

function findContentRoot(title) {
  const explicit = [
    ...document.querySelectorAll("main article, article, main section, main > div"),
  ];

  const scored = explicit
    .map((node) => ({
      node,
      score: scoreContentNode(node, title),
    }))
    .filter((entry) => entry.score > 40)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.node || null;
}

function scoreContentNode(node, title) {
  if (!(node instanceof HTMLElement)) {
    return 0;
  }

  const text = cleanText(node.innerText);
  if (!text) {
    return 0;
  }

  const paragraphs = node.querySelectorAll("p").length;
  const headings = node.querySelectorAll("h1, h2, h3, h4").length;
  const lists = node.querySelectorAll("ul, ol").length;
  const media = node.querySelectorAll("img, video").length;
  const titleMatch = title && text.includes(title) ? 25 : 0;
  const penalties = node.querySelectorAll("button, nav, aside, header, footer").length * 6;

  return (
    Math.min(text.length, 3000) / 20 +
    paragraphs * 12 +
    headings * 8 +
    lists * 10 +
    media * 4 +
    titleMatch -
    penalties
  );
}

function buildMarkdown(metadata, bodyMarkdown) {
  const lines = [
    `# ${metadata.title}`,
    "",
    `- Author: ${metadata.author || "Unknown"}`,
    metadata.publishedAt ? `- Published: ${metadata.publishedAt}` : null,
    `- Source: ${metadata.source}`,
    "",
    bodyMarkdown,
    "",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildFilename(metadata) {
  const slug = slugify(metadata.title || "x-article");
  const author = slugify(metadata.author || "");
  return author ? `${author}-${slug}.md` : `${slug}.md`;
}

function elementToMarkdown(root) {
  const blocks = [];

  for (const child of root.childNodes) {
    const block = nodeToMarkdown(child, { listDepth: 0 }).trim();
    if (block) {
      blocks.push(block);
    }
  }

  return blocks.join("\n\n");
}

function nodeToMarkdown(node, context) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(cleanText(node.textContent));
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node;
  if (shouldSkipElement(element)) {
    return "";
  }

  const tag = element.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const content = inlineChildrenToMarkdown(element);
    return content ? `${"#".repeat(level)} ${content}` : "";
  }

  if (tag === "p") {
    return inlineChildrenToMarkdown(element);
  }

  if (tag === "blockquote") {
    return inlineChildrenToMarkdown(element)
      .split("\n")
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (tag === "pre") {
    const code = element.textContent?.trim() || "";
    return code ? `\`\`\`\n${code}\n\`\`\`` : "";
  }

  if (tag === "hr") {
    return "---";
  }

  if (tag === "ul" || tag === "ol") {
    return listToMarkdown(element, context.listDepth);
  }

  if (tag === "img") {
    const alt = cleanText(element.getAttribute("alt")) || "Image";
    const src = element.getAttribute("src");
    return src ? `![${escapeMarkdownText(alt)}](${src})` : "";
  }

  if (tag === "figure") {
    return Array.from(element.childNodes)
      .map((child) => nodeToMarkdown(child, context))
      .filter(Boolean)
      .join("\n");
  }

  if (tag === "div" || tag === "section" || tag === "article") {
    return Array.from(element.childNodes)
      .map((child) => nodeToMarkdown(child, context))
      .filter(Boolean)
      .join("\n\n");
  }

  return inlineChildrenToMarkdown(element);
}

function inlineChildrenToMarkdown(element) {
  const chunks = [];

  for (const child of element.childNodes) {
    chunks.push(inlineNodeToMarkdown(child));
  }

  return normalizeInlineWhitespace(chunks.join(""));
}

function inlineNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node;
  if (shouldSkipElement(element)) {
    return "";
  }

  const tag = element.tagName.toLowerCase();
  const content = Array.from(element.childNodes)
    .map((child) => inlineNodeToMarkdown(child))
    .join("");

  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return content ? `**${content}**` : "";
    case "em":
    case "i":
      return content ? `*${content}*` : "";
    case "s":
    case "del":
      return content ? `~~${content}~~` : "";
    case "code":
      return content ? `\`${content.replace(/`/g, "\\`")}\`` : "";
    case "a": {
      const href = element.getAttribute("href");
      const label = normalizeInlineWhitespace(content);
      if (!href) {
        return label;
      }

      const absoluteHref = new URL(href, window.location.origin).href;
      return label ? `[${label}](${absoluteHref})` : absoluteHref;
    }
    default:
      return content;
  }
}

function listToMarkdown(list, depth) {
  const ordered = list.tagName.toLowerCase() === "ol";
  const items = Array.from(list.children).filter((child) => child.tagName?.toLowerCase() === "li");

  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const indent = "  ".repeat(depth);
      const segments = [];

      for (const child of item.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (tag === "ul" || tag === "ol") {
            const nested = listToMarkdown(child, depth + 1);
            if (nested) {
              segments.push(`\n${nested}`);
            }
            continue;
          }
        }

        const chunk = inlineNodeToMarkdown(child);
        if (chunk.trim()) {
          segments.push(chunk);
        }
      }

      return `${indent}${marker}${normalizeInlineWhitespace(segments.join("")).trim()}`;
    })
    .join("\n");
}

function shouldSkipElement(element) {
  const tag = element.tagName.toLowerCase();

  if (["script", "style", "noscript", "svg", "button", "nav", "footer"].includes(tag)) {
    return true;
  }

  if (element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const text = cleanText(element.textContent);
  return !text && !element.querySelector("img");
}

function normalizeInlineWhitespace(value) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownText(value) {
  return String(value || "").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function slugify(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "x-article";
}
