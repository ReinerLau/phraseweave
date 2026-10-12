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

function assertLayout() {
  cy.get('[data-testid="phonetic-hint"]')
    .should("be.visible")
    .then(($hint) => {
      const hint = $hint[0].getBoundingClientRect();
      cy.get(".question-input-word").then(($word) => {
        const word = $word[0].getBoundingClientRect();
        expect(hint.bottom).to.be.at.most(word.top + 1);
        expect(
          Math.abs((hint.left + hint.right) / 2 - (word.left + word.right) / 2),
        ).to.be.lessThan(2);
      });
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

describe("phonetic spelling hint and original sentence audio", () => {
  for (const [width, fulltext, dark] of [
    [1440, false, false],
    [320, false, true],
    [320, true, false],
    [1440, true, true],
  ] as const) {
    it(`places syllables above the word (${width}px, fulltext=${fulltext}, dark=${dark})`, () => {
      cy.viewport(width, 800);
      seed("computer", fulltext, dark);
      cy.get('[data-testid="phonetic-hint"]').should("not.exist");
      cy.get('input[type="text"]').type("x{enter}", { force: true });
      cy.get('[data-testid="phonetic-hint"]').should("contain.text", "/ˈpjuː/");
      cy.get('input[type="text"]').should("have.value", "");
      assertLayout();
      cy.get('[data-testid="phonetic-hint"]').should(($hint) => {
        expect(window.getComputedStyle($hint[0]).color).to.equal(
          dark ? "rgb(203, 213, 225)" : "rgb(100, 116, 139)",
        );
      });
      cy.screenshot(`phonetic-${width}-${fulltext}-${dark}`);
      cy.intercept("POST", "**/api/tts", { statusCode: 503, body: { error: "测试朗读失败" } }).as(
        "speech",
      );
      cy.get('[data-testid="sentence-audio-button"]').click();
      cy.wait("@speech")
        .its("request.body")
        .should("deep.equal", { text: "I use a computer every day.", kind: "sentence" });
      cy.contains("测试朗读失败").should("be.visible");
      cy.get('input[type="text"]').type("computer{enter}", { force: true });
      cy.get('[data-testid="phonetic-hint"]').should("not.exist");
      cy.get('[data-testid="sentence-audio-button"]').should("be.visible");
    });
  }

  it("wraps long syllable hints between whole syllables on a phone", () => {
    cy.viewport(320, 800);
    seed("antidisestablishmentarianism", false, false);
    cy.get('input[type="text"]').type("x{enter}", { force: true });
    cy.get(".phonetic-syllable").should("have.length", 12);
    assertLayout();
    cy.screenshot("phonetic-long-phone");
  });
});
