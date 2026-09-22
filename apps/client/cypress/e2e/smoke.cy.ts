describe("application shell", () => {
  it("loads without the removed environment banner", () => {
    cy.visit(Cypress.config("baseUrl") as string);

    cy.contains("练习清单").should("be.visible");
    cy.get("header").should("not.exist");
    cy.get('[data-testid="environment-banner"]').should("not.exist");
  });
});
