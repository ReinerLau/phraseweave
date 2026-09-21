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
  });

  it("keeps the question view within the viewport", () => {
    cy.contains(courseTitle).should("be.visible");
    assertNoHorizontalOverflow();
  });

  it("keeps the answer and contents views within the viewport", () => {
    cy.get('input[type="text"]')
      .type(englishSentence, { force: true })
      .type("{enter}", { force: true });
    cy.contains("再来一次").should("be.visible");
    assertNoHorizontalOverflow();

    cy.get('[data-tip="练习卡片列表"]').click();
    cy.get("#contents").should("have.class", "show");
    assertNoHorizontalOverflow();
  });
});
