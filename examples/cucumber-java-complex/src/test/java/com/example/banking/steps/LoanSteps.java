package com.example.banking.steps;

import com.example.banking.support.BankingApiHelper;
import com.example.banking.support.TestContext;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Step definitions for loan scenarios.
 *
 * Endpoint resolution chain:
 *   loans.feature -> LoanSteps
 *     -> BankingApiHelper.applyForLoan()    -> POST /api/v1/loans
 *     -> BankingApiHelper.getLoan()         -> GET  /api/v1/loans/{id}
 *     -> BankingApiHelper.makeLoanPayment() -> POST /api/v1/loans/{id}/payment
 */
public class LoanSteps {

    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // Given / setup
    // -----------------------------------------------------------------------

    @Given("an approved loan exists with id {string}")
    public void anApprovedLoanExistsWithId(String loanId) {
        testContext.setCurrentLoanId(loanId);
    }

    @Given("a customer with credit score {int}")
    public void aCustomerWithCreditScore(Integer creditScore) {
        testContext.put("creditScore", creditScore);
    }

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I apply for a personal loan of ${double} with term {int} months")
    public void applyForPersonalLoan(Double amount, Integer termMonths) {
        Integer creditScore = testContext.get("creditScore");
        Response response = bankingApiHelper.applyForLoan(Map.of(
                "type", "PERSONAL",
                "amount", amount,
                "termMonths", termMonths,
                "currency", "USD",
                "creditScore", creditScore != null ? creditScore : 720,
                "purpose", "Debt consolidation"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentLoanId(response.jsonPath().getString("id"));
        }
    }

    @When("I apply for a mortgage of ${double} with term {int} years")
    public void applyForMortgage(Double amount, Integer termYears) {
        Integer creditScore = testContext.get("creditScore");
        Response response = bankingApiHelper.applyForLoan(Map.of(
                "type", "MORTGAGE",
                "amount", amount,
                "termMonths", termYears * 12,
                "currency", "USD",
                "creditScore", creditScore != null ? creditScore : 750,
                "purpose", "Home purchase"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentLoanId(response.jsonPath().getString("id"));
        }
    }

    @When("I retrieve the loan details")
    public void retrieveLoanDetails() {
        String loanId = testContext.getCurrentLoanId();
        Response response = bankingApiHelper.getLoan(loanId);
        testContext.setLastResponse(response);
    }

    @When("I make a loan payment of ${double}")
    public void makeLoanPayment(Double paymentAmount) {
        String loanId = testContext.getCurrentLoanId();
        Response response = bankingApiHelper.makeLoanPayment(loanId, Map.of(
                "amount", paymentAmount,
                "currency", "USD",
                "paymentMethod", "ACH"
        ));
        testContext.setLastResponse(response);
    }

    @When("I try to apply for a loan with credit score below minimum")
    public void tryToApplyForLoanBelowMinimumCreditScore() {
        Response response = bankingApiHelper.applyForLoan(Map.of(
                "type", "PERSONAL",
                "amount", 5000.00,
                "termMonths", 12,
                "currency", "USD",
                "creditScore", 450,
                "purpose", "Test"
        ));
        testContext.setLastResponse(response);
    }

    @When("I make a loan payment that does not match the amortization schedule")
    public void makeLoanPaymentNotMatchingSchedule() {
        String loanId = testContext.getCurrentLoanId();
        Response response = bankingApiHelper.makeLoanPayment(loanId, Map.of(
                "amount", 1.00,
                "currency", "USD",
                "paymentMethod", "ACH"
        ));
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("the loan application should be approved")
    public void loanApplicationShouldBeApproved() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.jsonPath().getString("status")).isEqualToIgnoringCase("APPROVED");
    }

    @Then("the loan application should be rejected")
    public void loanApplicationShouldBeRejected() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isIn(400, 422);
        assertThat(response.jsonPath().getString("reason")).contains("credit");
    }

    @Then("I should see the loan details")
    public void iShouldSeeLoanDetails() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("id")).isNotBlank();
        assertThat(response.jsonPath().getDouble("amount")).isPositive();
    }

    @Then("the loan payment should be accepted")
    public void loanPaymentShouldBeAccepted() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
    }

    @Then("the payment should be rejected with a schedule mismatch error")
    public void paymentShouldBeRejectedWithScheduleMismatch() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.jsonPath().getString("errorCode"))
                .isEqualToIgnoringCase("LOAN_PAYMENT_SCHEDULE_MISMATCH");
    }

    @And("the remaining balance should decrease")
    public void remainingBalanceShouldDecrease() {
        assertThat(testContext.getLastResponse().jsonPath().getDouble("remainingBalance"))
                .isNotNegative();
    }
}
