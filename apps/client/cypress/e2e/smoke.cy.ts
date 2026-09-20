describe("deployed preview", () => {
  it("loads the application and identifies the preview build", () => {
    cy.visit(Cypress.config("baseUrl") as string);

    cy.contains("PhraseWeave").should("be.visible");
    cy.get('[data-testid="preview-banner"]').should("be.visible").and("contain.text", "测试环境");
    cy.window().then(async (window) => {
      const registrations = await window.navigator.serviceWorker.getRegistrations();
      const previewScope = new URL("./", Cypress.config("baseUrl") as string).href;
      const controllingScopes = registrations
        .map((registration) => registration.scope)
        .filter((scope) => previewScope.startsWith(scope));

      expect(controllingScopes).to.be.empty;
    });
  });
});
