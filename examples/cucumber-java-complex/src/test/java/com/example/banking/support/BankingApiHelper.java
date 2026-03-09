package com.example.banking.support;

import io.restassured.response.Response;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Domain-level API helper.
 *
 * Each method maps 1-to-1 with a logical banking operation and uses
 * PathConstants for every URL. This creates the indirect resolution chain:
 *
 *   Feature file
 *     -> Step definition (calls helper method)
 *       -> BankingApiHelper (references PathConstants constant)
 *         -> ApiClient (passes path to RestAssured)
 *           -> HTTP call to actual endpoint
 *
 * The analyzer traces this chain to determine which endpoints are exercised
 * by each BDD scenario, even though feature files contain no URLs.
 */
@Component
public class BankingApiHelper {

    private final ApiClient apiClient;
    private final TestContext testContext;

    public BankingApiHelper(ApiClient apiClient, TestContext testContext) {
        this.apiClient = apiClient;
        this.testContext = testContext;
    }

    // =========================================================================
    // Account operations
    // =========================================================================

    /** POST /api/v1/accounts */
    public Response createAccount(Map<String, Object> request) {
        return apiClient.post(PathConstants.ACCOUNTS_PATH, request);
    }

    /** GET /api/v1/accounts */
    public Response listAccounts() {
        return apiClient.get(PathConstants.ACCOUNTS_PATH);
    }

    /** GET /api/v1/accounts/{id} */
    public Response getAccount(String accountId) {
        return apiClient.get(PathConstants.ACCOUNT_PATH, "id", accountId);
    }

    /** PUT /api/v1/accounts/{id} */
    public Response updateAccount(String accountId, Map<String, Object> request) {
        return apiClient.put(PathConstants.ACCOUNT_PATH, "id", accountId, request);
    }

    /** DELETE /api/v1/accounts/{id} */
    public Response closeAccount(String accountId) {
        return apiClient.delete(PathConstants.ACCOUNT_PATH, "id", accountId);
    }

    /** GET /api/v1/accounts/{id}/balance */
    public Response getAccountBalance(String accountId) {
        return apiClient.get(PathConstants.ACCOUNT_BALANCE_PATH, "id", accountId);
    }

    /** GET /api/v1/accounts/{id}/statement */
    public Response getAccountStatement(String accountId) {
        return apiClient.get(PathConstants.ACCOUNT_STATEMENT_PATH, "id", accountId);
    }

    /** GET /api/v1/accounts/{id} without auth token */
    public Response getAccountUnauthenticated(String accountId) {
        return apiClient.getUnauthenticated(PathConstants.ACCOUNT_PATH, "id", accountId);
    }

    // =========================================================================
    // Transaction operations
    // =========================================================================

    /** POST /api/v1/transactions */
    public Response createTransaction(Map<String, Object> request) {
        return apiClient.post(PathConstants.TRANSACTIONS_PATH, request);
    }

    /** GET /api/v1/transactions */
    public Response listTransactions() {
        return apiClient.get(PathConstants.TRANSACTIONS_PATH);
    }

    /** GET /api/v1/transactions?accountId=... */
    public Response listTransactionsByAccount(String accountId) {
        return apiClient.getWithQueryParam(PathConstants.TRANSACTIONS_PATH, "accountId", accountId);
    }

    /** GET /api/v1/transactions/{id} */
    public Response getTransaction(String transactionId) {
        return apiClient.get(PathConstants.TRANSACTION_PATH, "id", transactionId);
    }

    // =========================================================================
    // Transfer operations
    // =========================================================================

    /** POST /api/v1/transfers */
    public Response initiateTransfer(Map<String, Object> request) {
        return apiClient.post(PathConstants.TRANSFERS_PATH, request);
    }

    /** GET /api/v1/transfers/{id} */
    public Response getTransfer(String transferId) {
        return apiClient.get(PathConstants.TRANSFER_PATH, "id", transferId);
    }

    // =========================================================================
    // Loan operations
    // =========================================================================

    /** POST /api/v1/loans */
    public Response applyForLoan(Map<String, Object> request) {
        return apiClient.post(PathConstants.LOANS_PATH, request);
    }

    /** GET /api/v1/loans/{id} */
    public Response getLoan(String loanId) {
        return apiClient.get(PathConstants.LOAN_PATH, "id", loanId);
    }

    /** POST /api/v1/loans/{id}/payment */
    public Response makeLoanPayment(String loanId, Map<String, Object> request) {
        return apiClient.postWithPathParam(PathConstants.LOAN_PAYMENT_PATH, "id", loanId, request);
    }

    // =========================================================================
    // Savings operations
    // =========================================================================

    /** POST /api/v1/savings */
    public Response openSavingsAccount(Map<String, Object> request) {
        return apiClient.post(PathConstants.SAVINGS_PATH, request);
    }

    /** GET /api/v1/savings/{id} */
    public Response getSavingsAccount(String savingsId) {
        return apiClient.get(PathConstants.SAVINGS_ACCOUNT_PATH, "id", savingsId);
    }

    /** POST /api/v1/savings/{id}/interest */
    public Response calculateSavingsInterest(String savingsId, Map<String, Object> request) {
        return apiClient.postWithPathParam(PathConstants.SAVINGS_INTEREST_PATH, "id", savingsId, request);
    }

    // =========================================================================
    // Beneficiary operations
    // =========================================================================

    /** POST /api/v1/beneficiaries */
    public Response addBeneficiary(Map<String, Object> request) {
        return apiClient.post(PathConstants.BENEFICIARIES_PATH, request);
    }

    /** GET /api/v1/beneficiaries */
    public Response listBeneficiaries() {
        return apiClient.get(PathConstants.BENEFICIARIES_PATH);
    }

    // =========================================================================
    // Statement operations
    // =========================================================================

    /** GET /api/v1/statements/{accountId} */
    public Response getStatement(String accountId) {
        return apiClient.get(PathConstants.STATEMENTS_PATH, "accountId", accountId);
    }

    // =========================================================================
    // Admin operations
    // =========================================================================

    /** GET /api/v1/admin/health */
    public Response checkHealth() {
        return apiClient.get(PathConstants.HEALTH_PATH);
    }

    /** GET /api/v1/admin/metrics */
    public Response getMetrics() {
        return apiClient.get(PathConstants.METRICS_PATH);
    }

    /** GET /api/v1/admin/audit-logs */
    public Response getAuditLogs() {
        return apiClient.get(PathConstants.AUDIT_LOGS_PATH);
    }
}
