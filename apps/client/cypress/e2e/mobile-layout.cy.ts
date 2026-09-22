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

  it("scales the input area with the available viewport", () => {
    let inputBeforeResize = { fontSize: 0, wordHeight: 0 };

    cy.get('input[type="text"]').type("this", { force: true });

    cy.get(".question-input-words").should(($words) => {
      const styles = window.getComputedStyle($words[0]);
      const wordHeight = $words[0]
        .querySelector<HTMLElement>(".question-input-word")
        ?.getBoundingClientRect().height;
      inputBeforeResize = {
        fontSize: parseFloat(styles.fontSize),
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
      const styles = window.getComputedStyle($words[0]);
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

  it("compresses the Chinese prompt in a short viewport", () => {
    let promptBeforeResize = { fontSize: 0, marginTop: 0, marginBottom: 0 };
    cy.get('[data-testid="question-prompt"]').then(($prompt) => {
      const styles = window.getComputedStyle($prompt[0]);
      promptBeforeResize = {
        fontSize: parseFloat(styles.fontSize),
        marginTop: parseFloat(styles.marginTop),
        marginBottom: parseFloat(styles.marginBottom),
      };
    });

    cy.viewport(320, 288);
    cy.get('[data-testid="question-prompt"]').should(($prompt) => {
      const styles = window.getComputedStyle($prompt[0]);
      expect(parseFloat(styles.fontSize)).to.be.at.most(promptBeforeResize.fontSize);
      expect(parseFloat(styles.marginTop)).to.be.at.most(promptBeforeResize.marginTop);
      expect(parseFloat(styles.marginBottom)).to.be.at.most(promptBeforeResize.marginBottom);
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

  it("shows the answer in the input area without opening a popup", () => {
    cy.get('input[type="text"]').type("wrong", { force: true });
    cy.contains("显示答案").click();

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

  it("filters non-Latin input and keeps the answer visible until a letter is entered", () => {
    cy.contains("显示答案").click();
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
