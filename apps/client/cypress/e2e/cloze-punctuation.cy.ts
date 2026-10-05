const punctuationPackId = "cloze-punctuation-pack";
const punctuationCourseId = "cloze-punctuation-course";
const punctuationSentence =
  "The new penalties will also be applied to other anti-social behaviour, such as putting feet on seats, littering, and eating or drinking on buses";
const punctuationAnswer = punctuationSentence.replace("-", " ").replaceAll(",", "");

function seedPunctuationExercise(english = punctuationSentence) {
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
                  { id: "punctuation", order: 1, english, sentenceChinese: "标点保留在原位。" },
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
