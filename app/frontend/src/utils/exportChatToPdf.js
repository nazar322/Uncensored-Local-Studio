const DEFAULT_CHAT_TITLE = "Chat Session";
const COLOR_STYLE_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "box-shadow",
  "text-shadow",
  "-webkit-text-stroke-color",
  "fill",
  "stroke",
  "stop-color",
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const toCssRgba = (red, green, blue, alpha = 1) => {
  const channel = (value) => Math.round(clamp(value) * 255);
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${clamp(alpha)})`;
};

const linearToSrgb = (value) => (
  value <= 0.0031308
    ? 12.92 * value
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
);

export function normalizeHtml2CanvasColors(value) {
  if (!value || value === "none") return value;

  return value
    .replace(
      /color\(srgb\s+([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s+([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s+([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)(?:\s*\/\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?))?\)/gi,
      (_, red, green, blue, alpha = "1") => toCssRgba(
        Number(red),
        Number(green),
        Number(blue),
        Number(alpha),
      ),
    )
    .replace(
      /oklab\(\s*([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)(?:\s*\/\s*([+-]?(?:\d*\.)?\d+))?\s*\)/gi,
      (_, lightness, aAxis, bAxis, alpha = "1") => {
        const light = Number(lightness);
        const a = Number(aAxis);
        const b = Number(bAxis);
        const lRoot = light + 0.3963377774 * a + 0.2158037573 * b;
        const mRoot = light - 0.1055613458 * a - 0.0638541728 * b;
        const sRoot = light - 0.0894841775 * a - 1.291485548 * b;
        const l = lRoot ** 3;
        const m = mRoot ** 3;
        const s = sRoot ** 3;
        return toCssRgba(
          linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
          Number(alpha),
        );
      },
    );
}

function prepareClonedSurfaceForHtml2Canvas(clonedDocument, clonedElement) {
  const captureRoot = clonedElement
    || clonedDocument.querySelector(".html2pdf__container")
    || clonedDocument;
  const surface = captureRoot.matches?.(".chat-pdf-export-surface")
    ? captureRoot
    : captureRoot.querySelector?.(".chat-pdf-export-surface");
  if (!surface) return;

  surface.style.position = "static";
  surface.style.inset = "auto";
  surface.style.transform = "none";

  const clonedWindow = clonedDocument.defaultView;
  if (!clonedWindow) return;

  [captureRoot, ...captureRoot.querySelectorAll("*")].forEach((element) => {
    const computed = clonedWindow.getComputedStyle(element);
    COLOR_STYLE_PROPERTIES.forEach((property) => {
      const originalValue = computed.getPropertyValue(property);
      const normalizedValue = normalizeHtml2CanvasColors(originalValue);
      if (normalizedValue !== originalValue) {
        element.style.setProperty(property, normalizedValue, "important");
      }
    });
    element.style.setProperty("animation", "none", "important");
    element.style.setProperty("transition", "none", "important");
  });
}

const messageText = (message) => {
  if (!message) return "";
  if (Array.isArray(message.content)) {
    return message.content
      .filter((item) => item?.type === "text")
      .map((item) => item.text || "")
      .join(" ")
      .trim();
  }
  return String(message.content || "").trim();
};

export function getChatPdfTitle(conversation, messages = []) {
  const savedTitle = String(conversation?.title || "").trim();
  if (savedTitle && savedTitle !== DEFAULT_CHAT_TITLE) return savedTitle;

  const firstUserMessage = messages.find((message) => message?.role === "user");
  const firstUserText = messageText(firstUserMessage);
  if (firstUserText) return firstUserText.slice(0, 80);

  return savedTitle || DEFAULT_CHAT_TITLE;
}

export function buildChatPdfFilename(title, date = new Date()) {
  const safeTitle = String(title || DEFAULT_CHAT_TITLE)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .trim();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${safeTitle || DEFAULT_CHAT_TITLE} - ${year}-${month}-${day}.pdf`;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createExportSurface({ messagesElement, title, modelName, exportedAt }) {
  const surface = document.createElement("section");
  surface.className = "chat-pdf-export-surface";
  surface.setAttribute("aria-hidden", "true");

  const header = document.createElement("header");
  header.className = "chat-pdf-header";

  const headingGroup = document.createElement("div");
  headingGroup.className = "chat-pdf-heading-group";
  headingGroup.appendChild(createTextElement("div", "chat-pdf-brand", "Local AI Studio"));
  headingGroup.appendChild(createTextElement("h1", "chat-pdf-title", title));

  const metadata = document.createElement("div");
  metadata.className = "chat-pdf-metadata";
  if (modelName) {
    metadata.appendChild(createTextElement("span", "chat-pdf-model", `Model: ${modelName}`));
  }
  metadata.appendChild(createTextElement(
    "span",
    "chat-pdf-date",
    `Exported: ${exportedAt.toLocaleString()}`,
  ));

  header.appendChild(headingGroup);
  header.appendChild(metadata);

  const messages = messagesElement.cloneNode(true);
  messages.classList.add("chat-pdf-messages");
  Array.from(messages.children).forEach((child) => {
    if (!child.classList.contains("chat-message-row")) child.remove();
  });

  surface.appendChild(header);
  surface.appendChild(messages);
  document.body.appendChild(surface);
  return surface;
}

async function waitForExportAssets(surface) {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const pendingImages = Array.from(surface.querySelectorAll("img"))
    .filter((image) => !image.complete)
    .map((image) => new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    }));

  if (pendingImages.length === 0) return;

  let timeoutId;
  await Promise.race([
    Promise.all(pendingImages),
    new Promise((resolve) => {
      timeoutId = window.setTimeout(resolve, 10000);
    }),
  ]);
  if (timeoutId) window.clearTimeout(timeoutId);
}

export async function exportChatToPdf({ messagesElement, title, modelName = "" }) {
  if (!messagesElement) throw new Error("The chat content is not available for export.");

  const exportedAt = new Date();
  const existingPdfArtifacts = new Set(document.querySelectorAll(
    ".html2pdf__overlay, .html2canvas-container",
  ));
  const surface = createExportSurface({ messagesElement, title, modelName, exportedAt });

  try {
    await waitForExportAssets(surface);
    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default || html2pdfModule;
    const rootStyles = getComputedStyle(document.documentElement);
    const backgroundColor = rootStyles.getPropertyValue("--md-sys-color-background").trim() || "#ffffff";

    const worker = html2pdf()
      .set({
        margin: 0,
        filename: buildChatPdfFilename(title, exportedAt),
        image: { type: "jpeg", quality: 0.98 },
        enableLinks: true,
        html2canvas: {
          backgroundColor,
          scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
          useCORS: true,
          allowTaint: false,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          onclone: prepareClonedSurfaceForHtml2Canvas,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
          compress: true,
        },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [".chat-pdf-header", ".chat-message-row", ".chat-generation-warning"],
        },
      })
      .from(surface)
      .toPdf();

    await worker
      .get("pdf", (pdf) => {
        pdf.setProperties({
          title,
          subject: "Local AI Studio chat export",
          author: "Local AI Studio",
          creator: "Local AI Studio",
        });
      })
      .save();
  } finally {
    surface.remove();
    document.querySelectorAll(".html2pdf__overlay, .html2canvas-container").forEach((element) => {
      if (!existingPdfArtifacts.has(element)) element.remove();
    });
  }
}
