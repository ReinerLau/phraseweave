const coursePackId = "mobile-overflow-pack";
const courseId = "mobile-overflow-course";
const courseTitle = "一个非常非常长的练习标题用于验证窄屏布局";
const englishSentence =
  "this is a deliberately long sentence that should wrap inside the mobile practice page";

function seedLocalExercise() {
  return cy.window().then(
    (window) =>
      new Cypress.Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open("phraseweave-local", 1);

        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("coursePacks")) {
            database.createObjectStore("coursePacks", { keyPath: "id" });
          }
          if (!database.objectStoreNames.contains("coursePackCatalog")) {
            database.createObjectStore("coursePackCatalog", { keyPath: "id" });
          }
          if (!database.objectStoreNames.contains("metadata")) {
            database.createObjectStore("metadata", { keyPath: "key" });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["coursePacks", "coursePackCatalog"],
            "readwrite",
          );
          transaction.objectStore("coursePacks").put({
            id: coursePackId,
            title: courseTitle,
            description: "",
            isFree: true,
            cover: "",
            courses: [
              {
                id: courseId,
                title: courseTitle,
                order: 1,
                coursePackId,
                completionCount: 0,
                statementIndex: 0,
                statements: [
                  {
                    id: "mobile-overflow-statement",
                    order: 1,
                    chinese: "这是一个测试句子",
                    english: englishSentence,
                    soundmark: "/ðɪs/",
                  },
                ],
              },
            ],
          });
          transaction.objectStore("coursePackCatalog").put({
            id: coursePackId,
            title: courseTitle,
            description: "",
            isFree: true,
            cover: "",
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

function assertNoHorizontalOverflow() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth + 1,
    );
  });
}

function assertNoVerticalOverflow() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollHeight).to.be.at.most(
      document.documentElement.clientHeight + 1,
    );
  });
}

function assertPracticePageDoesNotScroll() {
  assertNoVerticalOverflow();
  cy.window().then((window) => {
    expect(window.scrollY).to.equal(0);
  });
}

function assertQuestionInputDoesNotScroll() {
  assertPracticePageDoesNotScroll();
  cy.get(".question-input-shell").should(($shell) => {
    const element = $shell[0];
    const styles = window.getComputedStyle(element);
    expect(styles.overflowY).to.equal("hidden");
    expect(element.scrollTop).to.equal(0);
  });
}

// 用与应用相同的方式（同字体的隐藏探针）测量文字真实渲染宽度；可指定任意文本
function measureTextWidth(block: HTMLElement, text?: string) {
  const styles = window.getComputedStyle(block);
  const probe = block.ownerDocument.createElement("span");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;white-space:pre;";
  probe.style.fontStyle = styles.fontStyle;
  probe.style.fontWeight = styles.fontWeight;
  probe.style.fontSize = styles.fontSize;
  probe.style.fontFamily = styles.fontFamily;
  probe.style.letterSpacing = styles.letterSpacing;
  probe.textContent = text ?? block.textContent ?? "";
  block.ownerDocument.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

function blockDetail(block: HTMLElement) {
  const styles = window.getComputedStyle(block);
  const rect = block.getBoundingClientRect();
  return `text="${block.textContent ?? ""}" rect=${rect.width.toFixed(2)}x${rect.height.toFixed(
    2,
  )} styleWidth=${block.style.width} fontSize=${styles.fontSize}`;
}

// 输入块必须保持单行（单词整体换行，绝不在块内折断）
function assertInputBlocksStaySingleLine() {
  cy.get(".question-input-word").should(($blocks) => {
    for (const block of Array.from($blocks)) {
      const fontSize = parseFloat(window.getComputedStyle(block).fontSize);
      expect(
        block.getBoundingClientRect().height,
        `block stays on one line; ${blockDetail(block)}`,
      ).to.be.at.most(fontSize * 1.5);
    }
  });
}

// 整词输入完成后，下划线与其实测文字宽度齐平（差异只允许亚像素级安全余量）
function assertInputBlocksAlignWithText() {
  assertInputBlocksStaySingleLine();
  cy.get(".question-input-word").should(($blocks) => {
    for (const block of Array.from($blocks)) {
      const text = block.textContent ?? "";
      if (!text) continue;

      const textWidth = measureTextWidth(block);
      const difference = block.getBoundingClientRect().width - textWidth;
      expect(
        Math.abs(difference),
        `underline matches text; ${blockDetail(block)} textWidth=${textWidth.toFixed(2)}`,
      ).to.be.at.most(1.5);
    }
  });
}

// 固定长度提示：输入过程中块宽保持目标单词的实测宽度，不随输入生长
function assertBlockShowsFixedHint(word: string) {
  cy.get(".question-input-word")
    .first()
    .should(($block) => {
      const block = $block[0];
      const hintWidth = measureTextWidth(block, word);
      const difference = block.getBoundingClientRect().width - hintWidth;
      expect(
        Math.abs(difference),
        `block keeps fixed hint of "${word}"; ${blockDetail(block)} hintWidth=${hintWidth.toFixed(2)}`,
      ).to.be.at.most(1.5);
    });
}

// 记录每个输入块的上下边界，用于断言下划线位置不随输入移动
function captureBlockPositions(): Cypress.Chainable<Map<string, { top: number; bottom: number }>> {
  return cy.get(".question-input-word").then(($blocks) => {
    const positions = new Map<string, { top: number; bottom: number }>();
    Array.from($blocks).forEach((block, index) => {
      const rect = block.getBoundingClientRect();
      positions.set(String(index), { top: rect.top, bottom: rect.bottom });
    });
    return positions;
  });
}

function assertBlockPositionsUnchanged(positions: Map<string, { top: number; bottom: number }>) {
  cy.get(".question-input-word").should(($blocks) => {
    Array.from($blocks).forEach((block, index) => {
      const before = positions.get(String(index));
      expect(before, `block #${index} existed when positions were captured`).to.exist;
      if (!before) return;

      const rect = block.getBoundingClientRect();
      expect(
        Math.abs(rect.top - before.top),
        `underline top stays put; before=${before.top} after=${rect.top} ${blockDetail(block)}`,
      ).to.be.at.most(0.5);
      expect(
        Math.abs(rect.bottom - before.bottom),
        `underline bottom stays put; before=${before.bottom} after=${rect.bottom} ${blockDetail(block)}`,
      ).to.be.at.most(0.5);
    });
  });
}

function assertExerciseNavigationShellIsFullWidth() {
  cy.get('[data-testid="exercise-navigation-shell"]').should(($shell) => {
    const element = $shell[0];
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    expect(rect.left).to.equal(0);
    expect(rect.right).to.equal(1280);
    expect(rect.width).to.equal(1280);
    expect(styles.paddingLeft).to.equal("16px");
    expect(styles.paddingRight).to.equal("16px");
  });
}

function setNativeInputValue(value: string) {
  cy.get('input[type="text"]').then(($input) => {
    const input = $input[0] as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("mobile practice layout", () => {
  beforeEach(() => {
    cy.viewport(320, 568);
    cy.intercept("GET", "**/tool/dailySentence", {
      statusCode: 200,
      body: {
        data: {
          content: "This is a test sentence.",
          note: "这是一个测试句子。",
        },
      },
    });
    cy.visit("/course-pack");
    seedLocalExercise();
    cy.reload();
    cy.contains(courseTitle).first().click();
    cy.location("pathname").should("eq", `/game/${coursePackId}/${courseId}`);
    cy.contains("返回练习清单").should("not.exist");
  });

  it("keeps the question view within the viewport", () => {
    cy.contains(courseTitle).should("be.visible");
    assertNoHorizontalOverflow();
    assertNoVerticalOverflow();
  });

  it("keeps the practice controls at the bottom without a version or arrow controls", () => {
    cy.get("footer").should("not.exist");
    cy.get(".arrow-btn").should("not.exist");
    cy.get('[data-testid="practice-tips"] button').should("have.length", 1);
    cy.get('[data-testid="next-question-button"]').should("not.exist");
    cy.contains("显示答案").should("be.visible");
    cy.get('[data-testid="practice-tips"] button').should(($buttons) => {
      expect($buttons[0].getBoundingClientRect().height).to.be.at.least(48);
    });
    cy.get(".question-content").should(($question) => {
      const document = $question[0].ownerDocument;
      const questionTop = $question[0].getBoundingClientRect().top;
      const toolBottom =
        document.querySelector('[data-tip="练习卡片列表"]')?.getBoundingClientRect().bottom ?? 0;
      const tipsBottom =
        document.querySelector("[data-testid='practice-tips']")?.getBoundingClientRect().bottom ??
        0;
      const questionBottom = $question[0].getBoundingClientRect().bottom;
      const tipsTop =
        document.querySelector("[data-testid='practice-tips']")?.getBoundingClientRect().top ?? 0;

      expect(toolBottom).to.be.at.most(questionTop);
      expect(questionBottom).to.be.at.most(tipsTop + 1);
      expect(tipsBottom).to.be.at.most(568);
    });
  });

  // 空块必须与有文字的块同高：否则敲入首字符时块被撑高 2px，
  // flex 行内 stretch 对齐让整行下划线一起下移
  it("keeps the underlines steady when typing starts", () => {
    cy.wait(100); // 等题目字号自适应先落定
    captureBlockPositions().then((positions) => {
      cy.get('input[type="text"]').type("t", { force: true }).should("have.value", "t");
      assertBlockPositionsUnchanged(positions);

      cy.get('input[type="text"]').type("his", { force: true }).should("have.value", "this");
      assertBlockPositionsUnchanged(positions);
    });
  });

  it("scales the input area with the available viewport", () => {
    let inputBeforeResize = { fontSize: 0, wordHeight: 0 };

    cy.get(".question-input-word")
      .first()
      .should(($word) => {
        const styles = window.getComputedStyle($word[0]);
        expect(styles.whiteSpace).to.equal("normal");
        expect(styles.overflowWrap).to.equal("anywhere");
        expect($word[0].getBoundingClientRect().height).to.be.greaterThan(0);
      });

    // 输入过程中块宽保持目标单词的固定长度提示，不随输入生长
    cy.get('input[type="text"]').type("thi", { force: true }).should("have.value", "thi");
    assertBlockShowsFixedHint("this");
    assertInputBlocksStaySingleLine();

    // 继续输入触发容量截断，最终停在 "this"
    cy.get('input[type="text"]').type("shisthis", { force: true }).should("have.value", "this");
    assertInputBlocksAlignWithText();

    cy.get(".question-input-words").should(($words) => {
      const styles = window.getComputedStyle($words[0]);
      const questionStyles = window.getComputedStyle(
        $words[0].closest<HTMLElement>(".question-content")!,
      );
      const wordHeight = $words[0]
        .querySelector<HTMLElement>(".question-input-word")
        ?.getBoundingClientRect().height;
      inputBeforeResize = {
        fontSize: parseFloat(questionStyles.fontSize),
        wordHeight: wordHeight ?? 0,
      };
      expect(inputBeforeResize.fontSize).to.be.greaterThan(0);
      expect(inputBeforeResize.wordHeight).to.be.greaterThan(0);
    });

    cy.get('input[type="text"]').should(($input) => {
      const rect = $input[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(0);
      expect(rect.height).to.be.greaterThan(0);
    });

    cy.viewport(320, 288);
    cy.get(".question-input-words").should(($words) => {
      const styles = window.getComputedStyle($words[0].closest<HTMLElement>(".question-content")!);
      const wordHeight = $words[0]
        .querySelector<HTMLElement>(".question-input-word")
        ?.getBoundingClientRect().height;
      expect(parseFloat(styles.fontSize)).to.be.lessThan(inputBeforeResize.fontSize);
      expect(wordHeight).to.be.lessThan(inputBeforeResize.wordHeight);
    });
    cy.get('input[type="text"]').should(($input) => {
      const rect = $input[0].getBoundingClientRect();
      expect(rect.width).to.be.greaterThan(0);
      expect(rect.height).to.be.greaterThan(0);
      expect(rect.bottom).to.be.greaterThan(0);
      expect(rect.top).to.be.lessThan(288);
    });
    cy.get(".question-input-word")
      .first()
      .should(($word) => {
        const rect = $word[0].getBoundingClientRect();
        expect(rect.top).to.be.at.least(-1);
        expect(rect.bottom).to.be.at.most(289);
      });
    cy.get(".question-input-word").then(($words) => {
      const rowTops = new Set(
        [...$words].map((word) => Math.round(word.getBoundingClientRect().top)),
      );
      expect(rowTops.size).to.be.greaterThan(1);
    });
    assertInputBlocksAlignWithText();
    assertQuestionInputDoesNotScroll();
  });

  it("uses the full available width without a top navigation bar", () => {
    cy.viewport(1280, 800);
    cy.get("header").should("not.exist");
    assertExerciseNavigationShellIsFullWidth();
  });

  it("uses the full available width for the exercise list and course list", () => {
    cy.viewport(1280, 800);

    cy.visit("/");
    cy.contains("练习清单").should("be.visible");
    assertExerciseNavigationShellIsFullWidth();

    cy.visit("/course-pack");
    cy.contains("练习清单").should("be.visible");
    assertExerciseNavigationShellIsFullWidth();

    cy.visit(`/course-pack/${coursePackId}`);
    cy.contains("返回练习清单").should("be.visible");
    assertExerciseNavigationShellIsFullWidth();
  });

  it("does not stretch the page when the iOS keyboard shrinks the viewport", () => {
    cy.get('input[type="text"]').click({ force: true });
    let pageHeightBeforeKeyboard = 0;
    cy.window().then((window) => {
      pageHeightBeforeKeyboard = window.document.documentElement.scrollHeight;
      const viewport = window.visualViewport;
      expect(viewport).to.not.be.null;

      let viewportHeight = window.innerHeight;
      Object.defineProperty(viewport, "height", {
        configurable: true,
        get: () => viewportHeight,
      });
      viewportHeight -= 280;
      viewport?.dispatchEvent(new Event("resize"));
    });

    cy.get(".question-input-shell").should(($shell) => {
      const document = $shell[0].ownerDocument;
      expect(document.documentElement.scrollHeight).to.be.at.most(pageHeightBeforeKeyboard + 1);
    });
    cy.get('[data-testid="question-prompt"]').contains("这是一个测试句子").should("be.visible");
    assertQuestionInputDoesNotScroll();
  });

  it("uses the same shrinking font size for the Chinese prompt and input", () => {
    let promptBeforeResize = 0;
    cy.get('[data-testid="question-prompt"]').then(($prompt) => {
      const styles = window.getComputedStyle($prompt[0]);
      promptBeforeResize = parseFloat(styles.fontSize);
      expect(styles.fontSize).to.equal(
        window.getComputedStyle(
          $prompt[0]
            .closest<HTMLElement>(".question-content")!
            .querySelector(".question-input-words")!,
        ).fontSize,
      );
    });

    cy.viewport(320, 288);
    cy.get('[data-testid="question-prompt"]').should(($prompt) => {
      const styles = window.getComputedStyle($prompt[0]);
      expect(parseFloat(styles.fontSize)).to.be.lessThan(promptBeforeResize);
      expect(styles.fontSize).to.equal(
        window.getComputedStyle(
          $prompt[0]
            .closest<HTMLElement>(".question-content")!
            .querySelector(".question-input-words")!,
        ).fontSize,
      );
    });
  });

  it("keeps the answer and contents views within the viewport", () => {
    cy.get('input[type="text"]')
      .type(englishSentence, { force: true })
      .type("{enter}", { force: true });
    cy.contains("再来一次").should("be.visible");
    assertNoHorizontalOverflow();
    assertPracticePageDoesNotScroll();

    cy.get('[data-tip="练习卡片列表"]').click();
    cy.get("#contents").should("have.class", "show");
    cy.get("#contents").should(($contents) => {
      const rect = $contents[0].getBoundingClientRect();
      expect(rect.right).to.be.at.most(320);
      expect(rect.left).to.be.at.least(0);
    });
    assertNoHorizontalOverflow();
    assertPracticePageDoesNotScroll();
  });

  it("keeps the answer font size and content alignment from the question view", () => {
    let questionFontSize = "";
    cy.get('input[type="text"]').type(englishSentence, { force: true });
    cy.wait(100);
    assertInputBlocksAlignWithText();

    cy.get(".question-content").then(($question) => {
      questionFontSize = window
        .getComputedStyle($question[0])
        .getPropertyValue("--question-font-size");
      const promptTop = $question
        .find('[data-testid="question-prompt"]')[0]
        .getBoundingClientRect().top;
      const inputTop = $question.find(".question-input-words")[0].getBoundingClientRect().top;
      expect(promptTop).to.be.at.most(inputTop);
    });

    cy.get('input[type="text"]').type("{enter}", { force: true });

    cy.get(".answer-content").should(($answer) => {
      const answerFontSize = window
        .getComputedStyle($answer[0])
        .getPropertyValue("--question-font-size");
      const promptTop = $answer
        .find('[data-testid="answer-prompt"]')[0]
        .getBoundingClientRect().top;
      const wordsTop = $answer.find(".answer-words")[0].getBoundingClientRect().top;

      expect(answerFontSize).to.equal(questionFontSize);
      expect(promptTop).to.be.at.most(wordsTop);
    });
    cy.contains("再来一次").should("be.visible");
    cy.contains("下一题").should("be.visible");
    cy.get('[data-testid="practice-tips"] button')
      .should("have.length", 2)
      .should(($buttons) => {
        const detail = Array.from($buttons)
          .map((button) => {
            const b = button as HTMLElement;
            const s = window.getComputedStyle(b);
            const transforms: string[] = [];
            let el: HTMLElement | null = b;
            while (el && transforms.length < 8) {
              const t = window.getComputedStyle(el).transform;
              if (t && t !== "none") {
                transforms.push(`${el.tagName}.${String(el.className).slice(0, 40)}=${t}`);
              }
              el = el.parentElement;
            }
            const rect = b.getBoundingClientRect();
            return `rect=${rect.width.toFixed(3)}x${rect.height.toFixed(3)} styleH=${s.height} minH=${s.minHeight} transforms=[${transforms.join(" | ")}]`;
          })
          .join(" ~~ ");

        expect($buttons[0].getBoundingClientRect().height, detail).to.be.at.least(48);
        expect($buttons[1].getBoundingClientRect().height, detail).to.be.at.least(48);
        expect($buttons[0].getBoundingClientRect().width, detail).to.be.closeTo(
          $buttons[1].getBoundingClientRect().width,
          1.5,
        );
      });
    assertPracticePageDoesNotScroll();
  });

  it("shows the answer in the input area without opening a popup", () => {
    cy.get('input[type="text"]').type("wrong", { force: true });
    cy.get('[data-testid="show-answer-button"]').click({ force: true });
    cy.get('[data-testid="next-question-button"]').should("not.exist");

    cy.get('input[type="text"]').should("have.value", "");
    cy.get(".question-input-word")
      .first()
      .should("have.text", "this")
      .and("have.class", "text-gray-400")
      .and("have.class", "border-b-gray-300")
      .and("not.have.class", "border-b-fuchsia-500");
    cy.get(".card").should("not.exist");

    cy.get('input[type="text"]').should("not.be.focused");
    cy.get(".question-input-word")
      .first()
      .should("have.text", "this")
      .and("have.class", "border-b-gray-300")
      .and("not.have.class", "border-b-fuchsia-500");

    cy.get('input[type="text"]').click({ force: true }).should("be.focused");
    cy.get(".question-input-word")
      .first()
      .should("have.text", "this")
      .and("have.class", "text-gray-400")
      .and("have.class", "border-b-fuchsia-500")
      .and("not.have.class", "border-b-gray-300");

    cy.get('input[type="text"]')
      .type("{leftarrow}{backspace}{enter} ", { force: true })
      .should("have.value", " ");
    cy.contains("隐藏答案").should("be.visible");

    cy.get('input[type="text"]').clear({ force: true }).should("have.value", "");
    cy.get('input[type="text"]').type("this", { force: true }).should("have.value", "this");
    cy.get(".question-input-word").first().should("have.text", "this");
    cy.contains("隐藏答案").should("not.exist");
    assertQuestionInputDoesNotScroll();
  });

  it("focuses from the middle area but not from the top or bottom bars", () => {
    cy.get('input[type="text"]')
      .click({ force: true })
      .should("be.focused")
      .blur()
      .should("not.be.focused");

    cy.get('[data-testid="practice-focus-area"]').click("center");
    cy.get('input[type="text"]').should("be.focused");

    cy.get('input[type="text"]').blur().should("not.be.focused");
    cy.get('[data-tip="练习卡片列表"]').click();
    cy.get('input[type="text"]').should("not.be.focused");

    cy.get('[data-testid="show-answer-button"]').click({ force: true });
    cy.get('input[type="text"]').should("not.be.focused");
  });

  it("does not change the answer view when its middle area is clicked", () => {
    cy.get('input[type="text"]').type(englishSentence, { force: true }).type("{enter}", {
      force: true,
    });
    cy.contains("再来一次").should("be.visible");

    cy.get('[data-testid="practice-focus-area"]').click("center");
    cy.contains("再来一次").should("be.visible");
  });

  it("filters non-Latin input and keeps the answer visible until a letter is entered", () => {
    cy.get('[data-testid="show-answer-button"]').click({ force: true });
    cy.get('input[type="text"]').click({ force: true }).should("be.focused");

    setNativeInputValue("中文123");
    cy.get('input[type="text"]').should("have.value", "");
    cy.contains("隐藏答案").should("be.visible");

    setNativeInputValue(".,?!- ");
    cy.get('input[type="text"]').should("have.value", ".,?!- ");
    cy.contains("隐藏答案").should("be.visible");

    setNativeInputValue("中文a123");
    cy.get('input[type="text"]').should("have.value", "a");
    cy.contains("隐藏答案").should("not.exist");
  });

  it("moves the course title to the right without a return tooltip", () => {
    cy.get('[data-tip="重置当前练习卡片进度"]').should("not.exist");
    cy.get('[data-tip="练习清单"]').should("not.exist");
    cy.contains(courseTitle).should("be.visible");
  });

  it("disables iOS telephone detection for practice titles", () => {
    cy.get('meta[name="format-detection"]').should("have.attr", "content", "telephone=no");

    cy.get('[data-tip="练习卡片列表"]').click();
    cy.get("#contents").should("have.class", "show");
    cy.get('a[href^="tel:"]').should("not.exist");
    cy.location("pathname").should("eq", `/game/${coursePackId}/${courseId}`);
  });

  it("opens exercise actions from a touch tap", () => {
    cy.visit("/course-pack");
    cy.get('button[aria-label="更多操作"]')
      .should("be.visible")
      .then(($button) => {
        const button = $button[0];
        button.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerType: "touch",
          }),
        );
        button.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            pointerType: "touch",
          }),
        );
        button.click();
      });
    cy.get('button[aria-label="同步"]').should("be.visible");
    cy.get('button[aria-label="删除"]').should("be.visible");
  });
});
