const punctuationPackId = "cloze-punctuation-pack";
const punctuationCourseId = "cloze-punctuation-course";
const punctuationSentence =
  "The new penalties will also be applied to other anti-social behaviour, such as putting feet on seats, littering, and eating or drinking on buses";
const punctuationAnswer = punctuationSentence.replace("-", " ").replaceAll(",", "");

function seedPunctuationExercise(english = punctuationSentence, recognizeSentence = false) {
  return cy.window().then(
    (window) =>
      new Cypress.Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open("phraseweave-local", 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const store of ["coursePacks", "coursePackCatalog"]) {
            if (!database.objectStoreNames.contains(store))
              database.createObjectStore(store, { keyPath: "id" });
          }
          if (!database.objectStoreNames.contains("metadata"))
            database.createObjectStore("metadata", { keyPath: "key" });
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ["coursePacks", "coursePackCatalog"],
            "readwrite",
          );
          const catalog = {
            id: punctuationPackId,
            title: "标点填空",
            description: "",
            isFree: true,
            cover: "",
          };
          transaction.objectStore("coursePackCatalog").put(catalog);
          transaction.objectStore("coursePacks").put({
            ...catalog,
            courses: [
              {
                id: punctuationCourseId,
                title: "标点填空",
                order: 1,
                coursePackId: punctuationPackId,
                completionCount: 0,
                statementIndex: 0,
                statements: [
                  {
                    id: "punctuation",
                    order: 1,
                    english,
                    sentenceChinese: "标点保留在原位。",
                    ...(recognizeSentence
                      ? {
                          contextBefore: "",
                          contextAfter: "",
                          unitId: "punctuation-unit",
                          sourceUnitIds: [],
                        }
                      : {}),
                  },
                ],
              },
            ],
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

function assertFixedPunctuation() {
  cy.get(".cloze-punctuation").should(($parts) => {
    expect(Array.from($parts).map((part) => part.textContent)).to.deep.equal(["-", ",", ",", ","]);
    for (const part of Array.from($parts)) {
      expect(window.getComputedStyle(part).borderBottomWidth).to.equal("0px");
    }
  });
  cy.get(".question-input-group")
    .eq(9)
    .should(($group) => {
      const [anti, hyphen, social] = Array.from($group[0].children);
      expect(
        Math.abs(anti.getBoundingClientRect().right - hyphen.getBoundingClientRect().left),
      ).to.be.lessThan(1);
      expect(
        Math.abs(hyphen.getBoundingClientRect().right - social.getBoundingClientRect().left),
      ).to.be.lessThan(1);
    });
}

describe("cloze punctuation", () => {
  beforeEach(() => {
    cy.viewport(320, 568);
    cy.visit("/course-pack");
    seedPunctuationExercise();
    cy.visit(`/game/${punctuationPackId}/${punctuationCourseId}`);
    cy.get(".question-input-word").should("have.length", 25);
  });

  it("keeps punctuation visible and preserves layout from blank to tip to completed answer on a narrow screen", () => {
    assertFixedPunctuation();
    cy.get('[data-testid="show-answer-button"]').click({ force: true });
    cy.get(".question-input-word").eq(9).should("have.text", "anti");
    cy.get(".question-input-word").eq(10).should("have.text", "social");
    assertFixedPunctuation();
    cy.get('input[type="text"]').type(punctuationAnswer, { force: true, delay: 0 });
    cy.get('input[type="text"]').should("have.value", punctuationAnswer);
    assertFixedPunctuation();

    cy.window().then((window) => window.document.fonts.ready);
    cy.window().then(
      (window) =>
        new Cypress.Promise<void>((resolve) => {
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        }),
    );
    cy.get(".question-input-word").then(($words) => {
      function contentRect(word: HTMLElement, root: HTMLElement) {
        const rect = word.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        return {
          top: rect.top - rootRect.top + root.scrollTop,
          left: rect.left - rootRect.left + root.scrollLeft,
          width: rect.width,
          height: rect.height,
        };
      }
      const questionRoot = $words[0].closest<HTMLElement>(".question-content")!;
      const before = Array.from($words).map((word) => contentRect(word, questionRoot));
      cy.get('input[type="text"]').type("{enter}", { force: true });
      cy.get('[data-testid="answer-sentence"] .question-input-word').should(($answers) => {
        expect($answers).to.have.length(before.length);
        Array.from($answers).forEach((word, index) => {
          const after = contentRect(word, word.closest<HTMLElement>(".answer-content")!);
          for (const property of ["top", "left", "width", "height"] as const) {
            expect(
              Math.abs(after[property] - before[index][property]),
              `${property} of word ${index}`,
            ).to.be.at.most(1);
          }
        });
      });
    });
    assertFixedPunctuation();
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(
        document.documentElement.clientWidth + 1,
      );
    });
  });

  it("accepts typing the original punctuation and pasting the complete original sentence", () => {
    cy.get('input[type="text"]').type(punctuationSentence, { force: true, delay: 0 });
    cy.get('input[type="text"]').should("have.value", punctuationAnswer);
    cy.get('input[type="text"]')
      .clear({ force: true })
      .then(($input) => {
        const input = $input[0] as HTMLInputElement;
        input.value = punctuationSentence;
        input.setSelectionRange(input.value.length, input.value.length);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    cy.get('input[type="text"]')
      .should("have.value", punctuationAnswer)
      .type("{enter}", { force: true });
    cy.get('[data-testid="answer-sentence"]').should("be.visible");
  });

  it("switches between hyphenated blanks with space and backspace, then submits with space", () => {
    seedPunctuationExercise("anti-social,");
    cy.window().then((window) => window.localStorage.setItem("spaceSubmitAnswer", "true"));
    cy.reload();
    cy.get('input[type="text"]').type("anti ", { force: true });
    cy.get(".question-input-word").eq(1).should("have.class", "border-b-fuchsia-500");
    cy.get('input[type="text"]').type("{backspace}", { force: true });
    cy.get(".question-input-word").eq(0).should("have.class", "border-b-fuchsia-500");
    cy.get('input[type="text"]').type(" social ", { force: true });
    cy.get('[data-testid="answer-sentence"]').should("be.visible");
  });

  it("requires the internal apostrophe while showing quotes and parentheses", () => {
    seedPunctuationExercise("“don’t” (eat), please.");
    cy.reload();
    cy.get(".question-input-word").should("have.length", 3);
    cy.get('input[type="text"]').type("dont eat please{enter}", { force: true, delay: 0 });
    cy.get(".question-content").should("be.visible");
    cy.get('input[type="text"]').should("have.value", "");
    cy.get('input[type="text"]').type("don't eat please", { force: true, delay: 0 });
    cy.get('input[type="text"]')
      .should("have.value", "don't eat please")
      .type("{enter}", { force: true });
    cy.get('[data-testid="answer-sentence"]').should("be.visible");
    cy.get(".cloze-punctuation").should(($parts) => {
      expect(Array.from($parts).map((part) => part.textContent)).to.deep.equal([
        "“",
        "”",
        "(",
        "),",
        ".",
      ]);
    });
  });
});

// Range measures the rendered letters separately from the word's line box.
function letterUnderlineGapEm(word: HTMLElement) {
  const window = word.ownerDocument.defaultView!;
  const styles = window.getComputedStyle(word);
  const underline = window.getComputedStyle(word, "::after");
  const range = word.ownerDocument.createRange();
  range.selectNodeContents(word);
  const bottom = word.getBoundingClientRect().bottom;
  const underlineTop =
    underline.content === "none"
      ? bottom - parseFloat(styles.borderBottomWidth)
      : bottom - parseFloat(underline.bottom) - parseFloat(underline.borderBottomWidth);
  return (underlineTop - range.getBoundingClientRect().bottom) / parseFloat(styles.fontSize);
}

function assertFulltextWordGap(singleGap: number) {
  cy.get(".fulltext-body .question-input-words").should(($words) => {
    const words = $words[0];
    const styles = words.ownerDocument.defaultView!.getComputedStyle(words);
    expect(parseFloat(styles.columnGap), "fulltext column gap").to.be.closeTo(singleGap / 2, 0.1);
    expect(styles.rowGap, "fulltext row gap").to.equal("0px");
    expect(styles.fontSize, "fulltext font size").to.equal("18px");
    const groups = Array.from(words.querySelectorAll(".question-input-group"));
    let sameLinePairs = 0;
    for (let index = 1; index < groups.length; index++) {
      const previous = groups[index - 1].getBoundingClientRect();
      const current = groups[index].getBoundingClientRect();
      if (Math.abs(current.top - previous.top) < 1) {
        expect(current.left - previous.right, `gap before group ${index}`).to.be.closeTo(
          singleGap / 2,
          0.1,
        );
        sameLinePairs++;
      } else {
        expect(current.top - previous.top, "wrapped line spacing").to.be.closeTo(29.25, 0.1);
      }
    }
    expect(sameLinePairs, "measured adjacent groups").to.be.greaterThan(0);
  });
}

describe("cloze spacing across practice views", () => {
  for (const [width, height] of [
    [1000, 800],
    [320, 568],
    [1000, 1000],
    [1600, 1400],
  ]) {
    it(`scales word gaps and preserves letter-to-underline spacing at ${width}x${height}`, () => {
      cy.viewport(width, height);
      cy.visit("/course-pack");
      seedPunctuationExercise(punctuationSentence, true);
      cy.visit(`/game/${punctuationPackId}/${punctuationCourseId}`);
      cy.window().then((window) => window.document.fonts.ready);
      cy.get('input[aria-label="填写当前英文单元"]').type(punctuationAnswer, {
        force: true,
        delay: 0,
      });
      cy.get(".question-input-word")
        .first()
        .should("have.text", "The")
        .then(($word) => {
          const singleGap = letterUnderlineGapEm($word[0]);
          const words = $word[0].closest(".question-input-words")!;
          const singleColumnGap = parseFloat(
            words.ownerDocument.defaultView!.getComputedStyle(words).columnGap,
          );
          cy.get('select[aria-label="展示方式"]').select("fulltext");
          assertFulltextWordGap(singleColumnGap);
          cy.get('[data-testid="show-answer-button"]').click({ force: true });
          cy.get(".question-input-word")
            .first()
            .should("have.text", "The")
            .should(($hint) => {
              expect(letterUnderlineGapEm($hint[0]), "answer hint gap in em").to.be.closeTo(
                singleGap,
                0.03,
              );
            });
          assertFulltextWordGap(singleColumnGap);
          cy.get('input[aria-label="填写当前英文单元"]').type(punctuationAnswer, {
            force: true,
            delay: 0,
          });
          cy.get(".question-input-word")
            .first()
            .should("have.text", "The")
            .should(($typed) => {
              expect(letterUnderlineGapEm($typed[0]), "typed letter gap in em").to.be.closeTo(
                singleGap,
                0.03,
              );
            });
          assertFulltextWordGap(singleColumnGap);
          assertFixedPunctuation();
          cy.get(".question-input-word").then(($words) => {
            const before = Array.from($words).map((word) => word.getBoundingClientRect());
            cy.get('input[aria-label="填写当前英文单元"]').type("{enter}", { force: true });
            cy.get(".answer-content").should("exist");
            assertFulltextWordGap(singleColumnGap);
            cy.get(".answer-content .question-input-word").should(($answers) => {
              expect($answers).to.have.length(before.length);
              Array.from($answers).forEach((word, index) => {
                const after = word.getBoundingClientRect();
                for (const property of ["top", "left", "width", "height"] as const) {
                  expect(after[property], `${property} of word ${index}`).to.be.closeTo(
                    before[index][property],
                    1,
                  );
                }
              });
            });
          });
          cy.get('select[aria-label="展示方式"]').select("single");
          cy.get(".question-input-words").should(($single) => {
            expect(
              parseFloat(
                $single[0].ownerDocument.defaultView!.getComputedStyle($single[0]).columnGap,
              ),
              "single view gap after switching back",
            ).to.be.closeTo(singleColumnGap, 0.1);
          });
        });
    });
  }
});
