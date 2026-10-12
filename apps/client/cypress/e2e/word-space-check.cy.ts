const wordSpacePack = "word-space-check-pack";
const wordSpaceCourse = "word-space-check-course";

function seedWordSpaceExercise() {
  return cy.window().then(
    (window) =>
      new Cypress.Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open("phraseweave-local", 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const name of ["coursePacks", "coursePackCatalog"]) {
            if (!database.objectStoreNames.contains(name))
              database.createObjectStore(name, { keyPath: "id" });
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
            id: wordSpacePack,
            title: "逐词检查",
            description: "",
            isFree: true,
            cover: "",
          };
          transaction.objectStore("coursePackCatalog").put(catalog);
          transaction.objectStore("coursePacks").put({
            ...catalog,
            courses: [
              {
                id: wordSpaceCourse,
                coursePackId: wordSpacePack,
                title: "逐词检查",
                order: 1,
                completionCount: 0,
                statementIndex: 0,
                statements: [
                  { id: "sentence", order: 1, english: "Don’t eat.", sentenceChinese: "不要吃。" },
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

describe("word space checking", () => {
  for (const [width, height] of [
    [1280, 800],
    [320, 568],
  ]) {
    it(`locks confirmed words without shifting their geometry at ${width}x${height}`, () => {
      cy.viewport(width, height);
      cy.visit("/course-pack");
      seedWordSpaceExercise();
      cy.window().then((window) => {
        window.localStorage.setItem("wordSpaceCheck", "true");
        window.localStorage.setItem("keyboardSoundEnabled", "false");
        window.localStorage.setItem("autoNextQuestion", "false");
      });
      cy.visit(`/game/${wordSpacePack}/${wordSpaceCourse}`);
      const input = 'input[aria-label="填写当前英文单元"]';
      cy.get(input).type("don'tx ", { force: true });
      cy.get(input).should("have.value", "don'tx");
      cy.get(".question-input-word").eq(0).should("not.have.class", "border-b-transparent");
      cy.get(input).type("{backspace}", { force: true });
      cy.get(input).should("have.value", "don't");
      cy.document().then((document) => document.fonts.ready);
      cy.get(".question-input-word").then(($words) => {
        const before = Array.from($words).map((word) => word.getBoundingClientRect());
        cy.get(input).type(" ", { force: true }).should("have.value", "");
        cy.get(".question-input-word").should(($confirmed) => {
          Array.from($confirmed).forEach((word, index) => {
            const after = word.getBoundingClientRect();
            for (const property of ["left", "top", "width", "height"] as const) {
              expect(
                Math.abs(after[property] - before[index][property]),
                `${property} of word ${index}`,
              ).to.be.at.most(1);
            }
          });
          expect(getComputedStyle($confirmed[0]).borderBottomColor).to.equal("rgba(0, 0, 0, 0)");
        });
      });
      cy.get(input).type("{backspace}", { force: true });
      cy.get(".question-input-word").eq(0).should("have.text", "don't");
      cy.get(".question-input-word").eq(1).should("have.class", "border-b-fuchsia-500");
      cy.get(input).type("eat", { force: true });
      cy.get('[data-testid="answer-sentence"]').should("not.exist");
      cy.get(input).type(" ", { force: true });
      cy.get('[data-testid="answer-sentence"]').should("be.visible");
    });
  }
});
