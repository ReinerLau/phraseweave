describe("deployed preview", () => {
  it("loads the application and identifies the preview build", () => {
    cy.visit(Cypress.config("baseUrl") as string);

    cy.contains("PhraseWeave").should("be.visible");
    cy.get('[data-testid="preview-banner"]').should("be.visible").and("contain.text", "测试环境");
  });
});
