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
 * Step definitions for account management scenarios.
 *
 * Endpoint resolution chain for this class:
 *   Feature: account_management.feature
 *     -> AccountSteps (calls BankingApiHelper methods)
 *       -> BankingApiHelper (references PathConstants.ACCOUNTS_PATH etc.)
 *         -> ApiClient (passes path to RestAssured post/get/put/delete)
 *           -> HTTP calls to /api/v1/accounts, /api/v1/accounts/{id},
 *                            /api/v1/accounts/{id}/balance,
 *                            /api/v1/accounts/{id}/statement
 */
public class AccountSteps {

    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // Given / setup
    // -----------------------------------------------------------------------

    @Given("an account exists with id {string}")
    public void anAccountExistsWithId(String accountId) {
        testContext.setCurrentAccountId(accountId);
    }

    @Given("I have a checking account with balance ${double}")
    public void iHaveACheckingAccountWithBalance(Double balance) {
        Response response = bankingApiHelper.createAccount(Map.of(
                "type", "CHECKING",
                "initialDeposit", balance,
                "currency", "USD"
        ));
        assertThat(response.statusCode()).isEqualTo(201);
        testContext.setCurrentAccountId(response.jsonPath().getString("id"));
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I create a checking account with initial deposit of ${double}")
    public void createCheckingAccount(Double initialDeposit) {
        Response response = bankingApiHelper.createAccount(Map.of(
                "type", "CHECKING",
                "initialDeposit", initialDeposit,
                "currency", "USD"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentAccountId(response.jsonPath().getString("id"));
        }
    }

    @When("I create a savings account with minimum balance of ${double}")
    public void createSavingsAccount(Double minimumBalance) {
        Response response = bankingApiHelper.openSavingsAccount(Map.of(
                "type", "SAVINGS",
                "minimumBalance", minimumBalance,
                "currency", "USD"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentSavingsId(response.jsonPath().getString("id"));
        }
    }

    @When("I retrieve the account details")
    public void retrieveAccountDetails() {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.getAccount(accountId);
        testContext.setLastResponse(response);
    }

    @When("I update the account with a new display name {string}")
    public void updateAccountDisplayName(String displayName) {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.updateAccount(accountId, Map.of("displayName", displayName));
        testContext.setLastResponse(response);
    }

    @When("I close the account")
    public void closeAccount() {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.closeAccount(accountId);
        testContext.setLastResponse(response);
    }

    @When("I check the account balance")
    public void checkAccountBalance() {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.getAccountBalance(accountId);
        testContext.setLastResponse(response);
    }

    @When("I request the account statement")
    public void requestAccountStatement() {
        String accountId = testContext.getCurrentAccountId();
        Response response = bankingApiHelper.getAccountStatement(accountId);
        testContext.setLastResponse(response);
    }

    @When("I list all accounts")
    public void listAllAccounts() {
        Response response = bankingApiHelper.listAccounts();
        testContext.setLastResponse(response);
    }

    @When("I try to access account {string}")
    public void tryToAccessAccountUnauthenticated(String accountId) {
        Response response = bankingApiHelper.getAccountUnauthenticated(accountId);
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("the account should be created successfully")
    public void theAccountShouldBeCreatedSuccessfully() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(201);
    }

    @Then("the account balance should be ${double}")
    public void theAccountBalanceShouldBe(Double expectedBalance) {
        Response response = testContext.getLastResponse();
        Double actualBalance = response.jsonPath().getDouble("balance");
        assertThat(actualBalance).isEqualByComparingTo(expectedBalance);
    }

    @Then("I should see the account information")
    public void iShouldSeeTheAccountInformation() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("id")).isNotBlank();
        assertThat(response.jsonPath().getString("type")).isNotBlank();
    }

    @Then("the account should no longer exist")
    public void theAccountShouldNoLongerExist() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(204);
    }

    @Then("the balance response should show ${double}")
    public void balanceResponseShouldShow(Double expectedBalance) {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
        assertThat(testContext.getLastResponse().jsonPath().getDouble("balance"))
                .isEqualByComparingTo(expectedBalance);
    }

    @Then("the statement should contain transaction entries")
    public void statementShouldContainTransactionEntries() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
        assertThat(testContext.getLastResponse().jsonPath().getList("transactions")).isNotNull();
    }

    @And("the response should include an account id")
    public void responseShouldIncludeAccountId() {
        assertThat(testContext.getLastResponse().jsonPath().getString("id")).isNotBlank();
    }

    @Then("I should receive a 404 not found response")
    public void iShouldReceive404() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(404);
    }

    @Then("I should receive a 400 bad request response")
    public void iShouldReceive400() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(400);
    }

    @And("the error should describe the invalid field")
    public void errorShouldDescribeInvalidField() {
        String body = testContext.getLastResponse().asString();
        assertThat(body).isNotBlank();
    }
}
