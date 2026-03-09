package com.example.banking.support;

import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Scenario-scoped context for sharing state between step definitions.
 * Cucumber injects a fresh instance for every scenario.
 */
@Component
@ScenarioScope
public class TestContext {

    private String authToken;
    private String currentAccountId;
    private String currentTransactionId;
    private String currentTransferId;
    private String currentLoanId;
    private String currentSavingsId;
    private String currentBeneficiaryId;
    private io.restassured.response.Response lastResponse;
    private final Map<String, Object> store = new HashMap<>();

    // --- Auth token ---

    public String getToken() {
        return authToken;
    }

    public void setToken(String token) {
        this.authToken = token;
    }

    // --- Resource IDs ---

    public String getCurrentAccountId() { return currentAccountId; }
    public void setCurrentAccountId(String id) { this.currentAccountId = id; }

    public String getCurrentTransactionId() { return currentTransactionId; }
    public void setCurrentTransactionId(String id) { this.currentTransactionId = id; }

    public String getCurrentTransferId() { return currentTransferId; }
    public void setCurrentTransferId(String id) { this.currentTransferId = id; }

    public String getCurrentLoanId() { return currentLoanId; }
    public void setCurrentLoanId(String id) { this.currentLoanId = id; }

    public String getCurrentSavingsId() { return currentSavingsId; }
    public void setCurrentSavingsId(String id) { this.currentSavingsId = id; }

    public String getCurrentBeneficiaryId() { return currentBeneficiaryId; }
    public void setCurrentBeneficiaryId(String id) { this.currentBeneficiaryId = id; }

    // --- Last HTTP response ---

    public io.restassured.response.Response getLastResponse() { return lastResponse; }
    public void setLastResponse(io.restassured.response.Response response) { this.lastResponse = response; }

    // --- Generic key-value store ---

    public void put(String key, Object value) { store.put(key, value); }

    @SuppressWarnings("unchecked")
    public <T> T get(String key) { return (T) store.get(key); }

    public void clear() {
        authToken = null;
        currentAccountId = null;
        currentTransactionId = null;
        currentTransferId = null;
        currentLoanId = null;
        currentSavingsId = null;
        currentBeneficiaryId = null;
        lastResponse = null;
        store.clear();
    }
}
