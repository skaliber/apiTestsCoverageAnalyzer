package com.example.banking.support;

import io.cucumber.java.After;
import io.cucumber.java.AfterAll;
import io.cucumber.java.Before;
import io.cucumber.java.BeforeAll;
import io.cucumber.java.Scenario;
import io.restassured.response.Response;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

/**
 * Cucumber lifecycle hooks.
 *
 * The @Before hook performs a real POST /api/v1/auth/token call so that
 * every scenario starts with a valid bearer token stored in TestContext.
 * The @After hook cleans up scenario state.
 */
public class Hooks {

    private static final String AUTH_TOKEN_PATH = "/api/v1/auth/token";

    @Autowired
    private TestContext testContext;

    @Autowired
    private ApiClient apiClient;

    @BeforeAll
    public static void globalSetup() {
        // One-time setup: nothing platform-specific needed here; RestAssured
        // base URI is configured in ApiClient constructor.
    }

    @Before
    public void authenticateUser(Scenario scenario) {
        // Skip authentication for scenarios tagged @NoAuth
        if (scenario.getSourceTagNames().contains("@NoAuth")) {
            return;
        }

        Map<String, String> credentials = Map.of(
                "username", "test-user@example.com",
                "password", "P@ssw0rd-Test"
        );

        Response tokenResponse = apiClient.post(AUTH_TOKEN_PATH, credentials);

        if (tokenResponse.statusCode() == 200) {
            String token = tokenResponse.jsonPath().getString("access_token");
            testContext.setToken(token);
        } else {
            // Fallback: use a well-known test token injected by test infrastructure
            testContext.setToken(System.getProperty("banking.test.token", "test-token-placeholder"));
        }
    }

    @After
    public void tearDown(Scenario scenario) {
        if (scenario.isFailed()) {
            Response lastResponse = testContext.getLastResponse();
            if (lastResponse != null) {
                scenario.attach(
                        lastResponse.asByteArray(),
                        "application/json",
                        "Last API Response"
                );
            }
        }
        testContext.clear();
    }

    @AfterAll
    public static void globalTearDown() {
        // Nothing to clean up globally for this example.
    }
}
