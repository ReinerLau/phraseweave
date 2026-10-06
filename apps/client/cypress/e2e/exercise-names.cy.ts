const exerciseBackup = {
  schema_version: 4,
  statements: [
    {
      english: "The cat",
      context_before: "",
      context_after: " sleeps.",
      sentence_chinese: "猫在睡觉。",
      unit_id: "0:0",
      source_unit_ids: [],
    },
  ],
};

function selectExercise(value: unknown = exerciseBackup) {
  cy.get('input[type="file"]').selectFile(
    {
      contents: Cypress.Buffer.from(JSON.stringify(value)),
      fileName: "exercise.json",
      mimeType: "application/json",
    },
    { force: true },
  );
}

function assertNoOverflow() {
  cy.document().then((document) => {
    expect(document.documentElement.scrollWidth).to.be.at.most(
      document.documentElement.clientWidth + 1,
    );
  });
}

function readSavedExercises() {
  return cy.window().then(
    (window) =>
      new Cypress.Promise<any[]>((resolve, reject) => {
        const request = window.indexedDB.open("phraseweave-local", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("coursePacks", "readonly")
            .objectStore("coursePacks")
            .getAll();
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            database.close();
            resolve(read.result);
          };
        };
      }),
  );
}

describe("exercise names", () => {
  it("names an imported exercise on a phone and retains it across reload and navigation", () => {
    const title = "手机导入的自定义练习名称用于验证长标题不会撑开页面";
    cy.viewport(375, 812);
    cy.visit("/");
    cy.contains("练习清单").should("be.visible");
    selectExercise();
    cy.get("dialog[open]").should("be.visible");
    cy.get('dialog input[type="text"]').should("have.focus").clear().type(`  ${title}  `);
    assertNoOverflow();
    cy.contains("dialog button", /^添加$/).click();
    cy.get("dialog").should("not.have.attr", "open");
    cy.contains(".card-title", title).should("be.visible");
    cy.reload();
    cy.contains(".card-title", title).should("be.visible");
    assertNoOverflow();
    cy.contains(".card-title", title).click();
    cy.location("pathname").should("match", /^\/game\//);
    readSavedExercises().then((packs) => {
      const pack = packs.find((item) => item.title === title);
      expect(pack).to.exist;
      expect(pack.courses[0].title).to.equal(title);
    });
  });

  it("cancels a selected exercise without adding it", () => {
    cy.visit("/");
    cy.contains("练习清单").should("be.visible");
    readSavedExercises().then((before) => {
      selectExercise();
      cy.get('dialog input[type="text"]').clear().type("取消的练习");
      cy.get("dialog .modal-action").contains("button", "取消").click();
      cy.get("dialog").should("not.have.attr", "open");
      readSavedExercises().then((after) => expect(after).to.deep.equal(before));
    });
  });

  it("rejects multiple exercises without writing to storage", () => {
    cy.visit("/");
    cy.contains("练习清单").should("be.visible");
    readSavedExercises().then((before) => {
      const pack = {
        id: "first-pack",
        title: "第一个练习",
        courses: [
          {
            statements: [
              {
                english: "The cat",
                contextBefore: "",
                contextAfter: " sleeps.",
                sentenceChinese: "猫在睡觉。",
              },
            ],
          },
        ],
      };
      const alert = cy.stub();
      cy.on("window:alert", alert);
      selectExercise([pack, { ...pack, id: "second-pack" }]);
      cy.wrap(alert).should("have.been.calledWith", "仅支持导入单个练习");
      cy.get("dialog").should("not.have.attr", "open");
      readSavedExercises().then((after) => expect(after).to.deep.equal(before));
    });
  });

  it("uses a custom generated name with phone and desktop layouts", () => {
    const title = "生成器自定义练习";
    cy.viewport(375, 812);
    cy.intercept("GET", "**/api/status", {
      runtimeReady: true,
      modelDownloaded: true,
      initialization: { state: "ready", message: "Ready" },
    });
    cy.intercept("POST", "**/api/generate", { id: "name-test" });
    cy.intercept("GET", "**/api/jobs/name-test", {
      id: "name-test",
      state: "complete",
      result: { outputs: [{ name: "units.json", content: JSON.stringify(exerciseBackup) }] },
    });
    cy.intercept("DELETE", "**/api/jobs/name-test", { ok: true });
    cy.visit("/generator");
    cy.get("textarea").type("The cat sleeps.");
    cy.contains("button", "生成学习单元").should("be.enabled").click();
    cy.contains("生成文件").should("be.visible");
    cy.get('input[type="text"]')
      .should("have.value", "The cat sleeps.")
      .clear()
      .type(`  ${title}  `);
    assertNoOverflow();
    cy.viewport(1280, 800);
    assertNoOverflow();
    cy.contains("button", "保存并进入练习").click();
    cy.location("pathname").should("match", /^\/game\//);
    readSavedExercises().then((packs) => {
      const pack = packs.find((item) => item.title === title);
      expect(pack).to.exist;
      expect(pack.courses[0].title).to.equal(title);
    });
    cy.visit("/");
    cy.contains(".card-title", title).should("be.visible");
  });
});
