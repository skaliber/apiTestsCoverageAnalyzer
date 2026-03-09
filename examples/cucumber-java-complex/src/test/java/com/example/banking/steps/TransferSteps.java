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
 * Step definitions for fund transfer scenarios.
 *
 * Endpoint resolution chain:
 *   transfers.feature -> TransferSteps
 *     -> BankingApiHelper.addBeneficiary()   -> POST /api/v1/beneficiaries
 *     -> BankingApiHelper.listBeneficiaries() -> GET /api/v1/beneficiaries
 *     -> BankingApiHelper.initiateTransfer() -> POST /api/v1/transfers
 *     -> BankingApiHelper.getTransfer()      -> GET  /api/v1/transfers/{id}
 */
public class TransferSteps {

    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // Given / setup
    // -----------------------------------------------------------------------

    @Given("a verified beneficiary with account {string}")
    public void aVerifiedBeneficiaryWithAccount(String beneficiaryAccountId) {
        Response response = bankingApiHelper.addBeneficiary(Map.of(
                "name", "Test Beneficiary",
                "accountNumber", beneficiaryAccountId,
                "bankCode", "TEST001",
                "verified", true
        ));
        assertThat(response.statusCode()).isIn(200, 201);
        testContext.setCurrentBeneficiaryId(response.jsonPath().getString("id"));
    }

    @Given("an unverified beneficiary exists")
    public void anUnverifiedBeneficiaryExists() {
        Response response = bankingApiHelper.addBeneficiary(Map.of(
                "name", "Unverified Beneficiary",
                "accountNumber", "EXT-UNVERIFIED-001",
                "bankCode", "EXT999",
                "verified", false
        ));
        testContext.setCurrentBeneficiaryId(response.jsonPath().getString("id"));
    }

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I transfer ${double} to the beneficiary")
    public void transferToBeneficiary(Double amount) {
        String sourceAccountId   = testContext.getCurrentAccountId();
        String beneficiaryId     = testContext.getCurrentBeneficiaryId();
        Response response = bankingApiHelper.initiateTransfer(Map.of(
                "sourceAccountId", sourceAccountId,
                "beneficiaryId", beneficiaryId,
                "amount", amount,
                "currency", "USD",
                "reference", "Test transfer"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentTransferId(response.jsonPath().getString("id"));
        }
    }

    @When("I attempt to transfer ${double} to the unverified beneficiary")
    public void attemptTransferToUnverifiedBeneficiary(Double amount) {
        String sourceAccountId = testContext.getCurrentAccountId();
        String beneficiaryId   = testContext.getCurrentBeneficiaryId();
        Response response = bankingApiHelper.initiateTransfer(Map.of(
                "sourceAccountId", sourceAccountId,
                "beneficiaryId", beneficiaryId,
                "amount", amount,
                "currency", "USD",
                "reference", "Transfer to unverified"
        ));
        testContext.setLastResponse(response);
    }

    @When("I transfer ${double} exceeding the daily limit")
    public void transferAmountExceedingDailyLimit(Double amount) {
        String sourceAccountId = testContext.getCurrentAccountId();
        String beneficiaryId   = testContext.getCurrentBeneficiaryId();
        Response response = bankingApiHelper.initiateTransfer(Map.of(
                "sourceAccountId", sourceAccountId,
                "beneficiaryId", beneficiaryId,
                "amount", amount,
                "currency", "USD",
                "reference", "Large transfer exceeding limit"
        ));
        testContext.setLastResponse(response);
    }

    @When("I transfer ${double} as an international wire")
    public void transferInternationalWire(Double amount) {
        String sourceAccountId = testContext.getCurrentAccountId();
        String beneficiaryId   = testContext.getCurrentBeneficiaryId();
        Response response = bankingApiHelper.initiateTransfer(Map.of(
                "sourceAccountId", sourceAccountId,
                "beneficiaryId", beneficiaryId,
                "amount", amount,
                "currency", "EUR",
                "type", "INTERNATIONAL_WIRE",
                "swift", "DEUTDEDB",
                "reference", "International wire test"
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 201) {
            testContext.setCurrentTransferId(response.jsonPath().getString("id"));
        }
    }

    @When("I retrieve the transfer status")
    public void retrieveTransferStatus() {
        String transferId = testContext.getCurrentTransferId();
        Response response = bankingApiHelper.getTransfer(transferId);
        testContext.setLastResponse(response);
    }

    @When("I view my list of beneficiaries")
    public void viewListOfBeneficiaries() {
        Response response = bankingApiHelper.listBeneficiaries();
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("the transfer should be initiated successfully")
    public void transferShouldBeInitiatedSuccessfully() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(201);
    }

    @Then("the transfer should be rejected due to unverified beneficiary")
    public void transferShouldBeRejectedDueToUnverifiedBeneficiary() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isIn(400, 422);
        assertThat(response.jsonPath().getString("errorCode"))
                .isEqualToIgnoringCase("BENEFICIARY_NOT_VERIFIED");
    }

    @Then("the transfer should be rejected for exceeding daily limit")
    public void transferShouldBeRejectedForExceedingDailyLimit() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isIn(400, 422);
        assertThat(response.jsonPath().getString("errorCode"))
                .isEqualToIgnoringCase("TRANSFER_DAILY_LIMIT_EXCEEDED");
    }

    @Then("I should see the transfer status")
    public void iShouldSeeTransferStatus() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("status")).isNotBlank();
    }

    @And("the transfer status should be {string}")
    public void transferStatusShouldBe(String expectedStatus) {
        assertThat(testContext.getLastResponse().jsonPath().getString("status"))
                .isEqualToIgnoringCase(expectedStatus);
    }

    @Then("the beneficiary list should not be empty")
    public void beneficiaryListShouldNotBeEmpty() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
        assertThat(testContext.getLastResponse().jsonPath().getList("beneficiaries")).isNotEmpty();
    }
}
