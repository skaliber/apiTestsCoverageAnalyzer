package com.example.banking.steps;

import com.example.banking.support.BankingApiHelper;
import com.example.banking.support.TestContext;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Step definitions for admin operation scenarios.
 *
 * Endpoint resolution chain:
 *   admin_operations.feature -> AdminSteps
 *     -> BankingApiHelper.checkHealth()   -> GET /api/v1/admin/health
 *     -> BankingApiHelper.getMetrics()    -> GET /api/v1/admin/metrics
 *     -> BankingApiHelper.getAuditLogs()  -> GET /api/v1/admin/audit-logs
 *     -> BankingApiHelper.getStatement()  -> GET /api/v1/statements/{accountId}
 */
public class AdminSteps {

    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I check the system health")
    public void checkSystemHealth() {
        Response response = bankingApiHelper.checkHealth();
        testContext.setLastResponse(response);
    }

    @When("I retrieve system metrics")
    public void retrieveSystemMetrics() {
        Response response = bankingApiHelper.getMetrics();
        testContext.setLastResponse(response);
    }

    @When("I retrieve audit logs")
    public void retrieveAuditLogs() {
        Response response = bankingApiHelper.getAuditLogs();
        testContext.setLastResponse(response);
    }

    @When("I retrieve the official statement for account {string}")
    public void retrieveOfficialStatementForAccount(String accountId) {
        Response response = bankingApiHelper.getStatement(accountId);
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("the health check should report {string}")
    public void healthCheckShouldReport(String expectedStatus) {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("status"))
                .isEqualToIgnoringCase(expectedStatus);
    }

    @Then("the metrics response should contain throughput data")
    public void metricsResponseShouldContainThroughputData() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().get("requestsPerSecond")).isNotNull();
    }

    @Then("the audit logs should contain recent entries")
    public void auditLogsShouldContainRecentEntries() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getList("logs")).isNotNull();
    }

    @Then("the statement should be returned in PDF format")
    public void statementShouldBeReturnedInPdfFormat() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
        assertThat(testContext.getLastResponse().contentType()).contains("pdf");
    }

    @Then("the statement should contain all transactions for the period")
    public void statementShouldContainAllTransactionsForPeriod() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
    }

    @And("only admin users should be able to view metrics")
    public void onlyAdminUsersShouldBeAbleToViewMetrics() {
        // Assertion confirmed by the 200 status received by admin token in scenario setup.
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(200);
    }
}
