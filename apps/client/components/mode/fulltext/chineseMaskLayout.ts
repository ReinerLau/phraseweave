export interface MaskLine {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChineseMaskLayout {
  height: number;
  lines: MaskLine[];
}

/** Measure with the browser's line breaking, then retain only line rectangles. */
export function measureChineseMasks(
  container: HTMLElement,
  sentences: { id: string; chinese: string }[],
): Record<string, ChineseMaskLayout> {
  const document = container.ownerDocument;
  const styles = document.defaultView!.getComputedStyle(container);
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.dataset.fulltextMaskProbe = "";
  Object.assign(probe.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    width: `${container.clientWidth}px`,
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    fontStyle: styles.fontStyle,
    letterSpacing: styles.letterSpacing,
    lineHeight: styles.lineHeight,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    wordBreak: "normal",
  });
  const paragraphs = sentences.map((sentence) => {
    const paragraph = document.createElement("p");
    paragraph.style.margin = "0";
    paragraph.textContent = sentence.chinese;
    probe.append(paragraph);
    return paragraph;
  });
  const result: Record<string, ChineseMaskLayout> = {};
  document.body.append(probe);
  try {
    for (const [index, paragraph] of paragraphs.entries()) {
      const bounds = paragraph.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const lines: MaskLine[] = [];
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const top = rect.top - bounds.top;
        const left = rect.left - bounds.left;
        const line = lines.find((line) => Math.abs(line.top - top) < 1);
        if (line) {
          const right = Math.max(line.left + line.width, left + rect.width);
          line.left = Math.min(line.left, left);
          line.width = right - line.left;
          line.height = Math.max(line.height, rect.height);
        } else {
          lines.push({ left, top, width: rect.width, height: rect.height });
        }
      }
      result[sentences[index].id] = { height: bounds.height, lines };
    }
    return result;
  } finally {
    probe.remove();
  }
}
