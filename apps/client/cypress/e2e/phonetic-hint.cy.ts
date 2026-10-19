export {};

const packId = "phonetic-hint-pack";
const courseId = "phonetic-hint-course";

function seed(word: string, fulltext: boolean, dark: boolean) {
  cy.visit("/course-pack");
  cy.window().then((window) => {
    window.localStorage.setItem("autoNextQuestion", "false");
    window.localStorage.setItem("DARK_MODE", dark ? "dark" : "light");
    return new Cypress.Promise<void>((resolve, reject) => {
      const open = window.indexedDB.open("phraseweave-local", 1);
      open.onupgradeneeded = () => {
        for (const store of ["coursePacks", "coursePackCatalog", "metadata"])
          if (!open.result.objectStoreNames.contains(store))
            open.result.createObjectStore(store, { keyPath: store === "metadata" ? "key" : "id" });
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(["coursePacks", "coursePackCatalog"], "readwrite");
        const catalog = { id: packId, title: "音标提示", description: "", isFree: true, cover: "" };
        tx.objectStore("coursePackCatalog").put(catalog);
        tx.objectStore("coursePacks").put({
          ...catalog,
          courses: [
            {
              id: courseId,
              title: "音标提示",
              order: 1,
              coursePackId: packId,
              completionCount: 0,
              statementIndex: 0,
              learningMode: "progressive",
              practiceView: fulltext ? "fulltext" : "single",
              statements: [
                {
                  id: "word",
                  unitId: "word",
                  sourceUnitIds: [],
                  order: 1,
                  english: word,
                  contextBefore: "I use a ",
                  contextAfter: " every day.",
                  sentenceChinese: "我每天使用它。",
                },
                {
                  id: "whole",
                  unitId: "whole",
                  sourceUnitIds: ["word"],
                  order: 2,
                  english: `I use a ${word} every day.`,
                  contextBefore: "",
                  contextAfter: "",
                  sentenceChinese: "我每天使用它。",
                },
              ],
            },
          ],
        });
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  cy.visit(`/game/${packId}/${courseId}`);
  cy.document().then((document) => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  });
  cy.get(".question-input-word").should("have.length", 1);
}

function assertLayout(sameLine = false) {
  cy.get('[data-testid="phonetic-hint"]')
    .should("be.visible")
    .should(($hint) => {
      const hint = $hint[0].getBoundingClientRect();
      const root = $hint[0].closest(".question-content-flow")!;
      const sentence = root.querySelector('[data-testid="cloze-sentence"]')!;
      const context = sentence.querySelectorAll(".cloze-context")[1];
      const word = root.querySelector(".question-input-word")!;
      const styles = window.getComputedStyle($hint[0]);
      const range = context.ownerDocument.createRange();
      range.selectNodeContents(context);
      const tail = Array.from(range.getClientRects()).at(-1)!;
      const firstSyllable = $hint[0].querySelector(".phonetic-syllable")!.getBoundingClientRect();
      expect($hint[0].parentElement).to.equal(sentence);
      expect($hint[0].previousElementSibling).to.equal(context);
      expect(sentence.lastElementChild).to.equal($hint[0]);
      expect(context.textContent).to.equal(" every day.");
      if (sameLine) {
        expect(firstSyllable.top).to.be.lessThan(tail.bottom);
        expect(firstSyllable.bottom).to.be.greaterThan(tail.top);
        expect(firstSyllable.left).to.be.greaterThan(tail.right);
      } else if (firstSyllable.top < tail.bottom && firstSyllable.bottom > tail.top) {
        expect(firstSyllable.left).to.be.greaterThan(tail.right);
      } else {
        expect(firstSyllable.top).to.be.at.least(tail.bottom - 1);
      }
      expect(hint.left).to.be.at.least(sentence.getBoundingClientRect().left - 1);
      expect(hint.right).to.be.at.most(sentence.getBoundingClientRect().right + 1);
      expect(parseFloat(styles.fontSize)).to.be.at.least(20);
      expect(parseFloat(styles.fontSize)).to.be.at.least(
        parseFloat(window.getComputedStyle(word).fontSize),
      );
      expect($hint[0].closest(".question-input-shell")).to.equal(null);
    });
  cy.get('[data-testid="cloze-sentence"]').should(($sentence) => {
    expect($sentence[0].scrollWidth).to.be.at.most($sentence[0].clientWidth + 1);
  });
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth,
    );
  });
}

describe("sentence-end phonetic spelling hint and original sentence audio", () => {
  for (const [width, fulltext, dark] of [
    [1440, false, false],
    [1440, false, true],
    [1440, true, false],
    [1440, true, true],
    [320, false, false],
    [320, false, true],
    [320, true, false],
    [320, true, true],
  ] as const) {
    it(`appends pronunciation after the sentence (${width}px, fulltext=${fulltext}, dark=${dark})`, () => {
      cy.viewport(width, 800);
      seed("computer", fulltext, dark);
      cy.get('[data-testid="phonetic-hint"]').should("not.exist");
      cy.get('input[type="text"]').type("x{enter}", { force: true });
      cy.get('[data-testid="phonetic-hint"]').should("contain.text", "/ˈpjuː/");
      cy.get('input[type="text"]').should("have.value", "");
      assertLayout(width === 1440);
      cy.get('[data-testid="phonetic-hint"]').should(($hint) => {
        expect(window.getComputedStyle($hint[0]).color).to.equal(
          dark ? "rgb(203, 213, 225)" : "rgb(100, 116, 139)",
        );
      });
      cy.screenshot(`phonetic-${width}-${fulltext}-${dark}`);
      cy.get('[data-testid="sentence-audio-button"]').should("not.exist");
      cy.get('input[type="text"]').type("computer ", { force: true });
      cy.get('[data-testid="phonetic-hint"]').should("not.exist");
      cy.get('[data-testid="sentence-audio-button"]').should("be.visible");
      cy.intercept("POST", "**/api/tts", { statusCode: 503, body: { error: "测试朗读失败" } }).as(
        "speech",
      );
      cy.get('[data-testid="sentence-audio-button"]').click();
      cy.wait("@speech")
        .its("request.body")
        .should("deep.equal", { text: "I use a computer every day.", kind: "sentence" });
      cy.contains("测试朗读失败").should("be.visible");
    });
  }

  it("wraps long syllable hints between whole syllables on a phone", () => {
    cy.viewport(320, 800);
    seed("antidisestablishmentarianism", false, false);
    cy.get('input[type="text"]').type("x{enter}", { force: true });
    cy.get(".phonetic-syllable").should("have.length", 12);
    assertLayout();
    cy.get(".phonetic-syllable").should(($syllables) => {
      const rows = new Set(
        Array.from($syllables, (syllable) => syllable.getBoundingClientRect().top),
      );
      expect(rows.size).to.be.greaterThan(1);
    });
    cy.screenshot("phonetic-long-phone");
  });
});
