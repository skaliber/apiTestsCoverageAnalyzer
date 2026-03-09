package com.example.banking.steps;

import com.example.banking.support.BankingApiHelper;
import com.example.banking.support.TestContext;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Step definitions for transaction scenarios.
 *
 * Endpoint resolution chain:
 *   transactions.feature -> TransactionSteps
 *     -> BankingApiHelper.createTransaction()    -> POST /api/v1/transactions
 *     -> BankingApiHelper.listTransactions()     -> GET  /api/v1/transactions
 *     -> BankingApiHelper.getTransaction()       -> GET  /api/v1/transactions/{id}
 *     -> BankingApiHelper.listTransactionsByAccount() -> GET /api/v1/transactions?accountId=...
 */
public class TransactionSteps {

    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I make a deposit of ${double} to the account")
    public void makeDeposit(Double amount) {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.createTransaction(Map.of(
                "accountId", accountId,
                "type", "DEPOSIT",
                "amount", amount,
                "currency", "USD",
                "description", "Test deposit"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentTransactionId(response.jsonPath().getString("id"));
        }
    }

    @When("I make a withdrawal of ${double} from the account")
    public void makeWithdrawal(Double amount) {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.createTransaction(Map.of(
                "accountId", accountId,
                "type", "WITHDRAWAL",
                "amount", amount,
                "currency", "USD",
                "description", "Test withdrawal"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentTransactionId(response.jsonPath().getString("id"));
        }
    }

    @When("I retrieve the transaction history for the account")
    public void retrieveTransactionHistory() {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.listTransactionsByAccount(accountId);
        testContext.setLastResponse(response);
    }

    @When("I retrieve details of the last transaction")
    public void retrieveLastTransactionDetails() {
        String transactionId = testContext.getCurrentTransactionId();
        Response response = bankingApiHelper.getTransaction(transactionId);
        testContext.setLastResponse(response);
    }

    @When("I try to withdraw ${double} from a dormant account")
    public void tryToWithdrawFromDormantAccount(Double amount) {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.createTransaction(Map.of(
                "accountId", accountId,
                "type", "WITHDRAWAL",
                "amount", amount,
                "currency", "USD",
                "description", "Withdrawal attempt on dormant account"
        ));
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("the transaction should be recorded successfully")
    public void transactionShouldBeRecordedSuccessfully() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(201);
    }

    @Then("the transaction history should not be empty")
    public void transactionHistoryShouldNotBeEmpty() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
        assertThat(testContext.getLastResponse().jsonPath().getList("transactions")).isNotEmpty();
    }

    @Then("I should see the transaction details")
    public void iShouldSeeTransactionDetails() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("id")).isNotBlank();
        assertThat(response.jsonPath().getString("type")).isNotBlank();
        assertThat(response.jsonPath().getDouble("amount")).isPositive();
    }

    @And("the transaction type should be {string}")
    public void transactionTypeShouldBe(String expectedType) {
        assertThat(testContext.getLastResponse().jsonPath().getString("type"))
                .isEqualToIgnoringCase(expectedType);
    }

    @Then("I should receive a 422 error")
    public void iShouldReceive422Error() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(422);
    }

    @Then("the error should mention insufficient funds")
    public void errorShouldMentionInsufficientFunds() {
        Response response = testContext.getLastResponse();
        String body = response.asString();
        assertThat(body.toLowerCase()).containsAnyOf("insufficient", "balance", "overdraft");
    }
}
