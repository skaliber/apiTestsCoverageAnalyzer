package com.example.banking.support;

/**
 * Central registry of all API endpoint path constants.
 *
 * The analyzer resolves endpoints indirectly by finding usages of these
 * constants in BankingApiHelper and step definitions, then tracing them
 * back here to determine the literal path strings.
 */
public class PathConstants {

    private PathConstants() {}

    // Account endpoints
    public static final String ACCOUNTS_PATH             = "/api/v1/accounts";
    public static final String ACCOUNT_PATH              = "/api/v1/accounts/{id}";
    public static final String ACCOUNT_BALANCE_PATH      = "/api/v1/accounts/{id}/balance";
    public static final String ACCOUNT_STATEMENT_PATH    = "/api/v1/accounts/{id}/statement";

    // Transaction endpoints
    public static final String TRANSACTIONS_PATH         = "/api/v1/transactions";
    public static final String TRANSACTION_PATH          = "/api/v1/transactions/{id}";

    // Transfer endpoints
    public static final String TRANSFERS_PATH            = "/api/v1/transfers";
    public static final String TRANSFER_PATH             = "/api/v1/transfers/{id}";

    // Loan endpoints
    public static final String LOANS_PATH                = "/api/v1/loans";
    public static final String LOAN_PATH                 = "/api/v1/loans/{id}";
    public static final String LOAN_PAYMENT_PATH         = "/api/v1/loans/{id}/payment";

    // Savings endpoints
    public static final String SAVINGS_PATH              = "/api/v1/savings";
    public static final String SAVINGS_ACCOUNT_PATH      = "/api/v1/savings/{id}";
    public static final String SAVINGS_INTEREST_PATH     = "/api/v1/savings/{id}/interest";

    // Beneficiary endpoints
    public static final String BENEFICIARIES_PATH        = "/api/v1/beneficiaries";
    public static final String BENEFICIARY_PATH          = "/api/v1/beneficiaries/{id}";

    // Statement endpoints
    public static final String STATEMENTS_PATH           = "/api/v1/statements/{accountId}";

    // Admin endpoints
    public static final String HEALTH_PATH               = "/api/v1/admin/health";
    public static final String METRICS_PATH              = "/api/v1/admin/metrics";
    public static final String AUDIT_LOGS_PATH           = "/api/v1/admin/audit-logs";
}
