describe("application shell", () => {
  it("loads without the removed environment banner", () => {
    cy.visit(Cypress.config("baseUrl") as string);

    cy.contains("PhraseWeave").should("be.visible");
    cy.get('[data-testid="environment-banner"]').should("not.exist");
  });
});
