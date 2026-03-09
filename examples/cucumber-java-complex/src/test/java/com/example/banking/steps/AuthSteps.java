package com.example.banking.steps;

import com.example.banking.support.ApiClient;
import com.example.banking.support.BankingApiHelper;
import com.example.banking.support.TestContext;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.response.Response;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Step definitions for authentication and security scenarios.
 *
 * Endpoint resolution chain:
 *   security_scenarios.feature -> AuthSteps
 *     -> ApiClient.post(AUTH_TOKEN_PATH)           -> POST /api/v1/auth/token
 *     -> BankingApiHelper.getAccountUnauthenticated() -> GET /api/v1/accounts/{id} (no token)
 *
 * Note: The auth endpoint appears here directly via a String literal
 * while account access appears indirectly through PathConstants.ACCOUNT_PATH.
 * The analyzer resolves both patterns.
 */
public class AuthSteps {

    private static final String AUTH_TOKEN_PATH  = "/api/v1/auth/token";
    private static final String AUTH_LOGOUT_PATH = "/api/v1/auth/logout";

    @Autowired private ApiClient        apiClient;
    @Autowired private BankingApiHelper bankingApiHelper;
    @Autowired private TestContext      testContext;

    // -----------------------------------------------------------------------
    // Given / setup
    // -----------------------------------------------------------------------

    @Given("I am authenticated with valid credentials")
    public void iAmAuthenticatedWithValidCredentials() {
        // Token is provisioned by the @Before hook in Hooks.java.
        // This step simply asserts the hook ran successfully.
        assertThat(testContext.getToken())
                .as("Auth token must be set by @Before hook")
                .isNotBlank();
    }

    @Given("I am not authenticated")
    public void iAmNotAuthenticated() {
        // Clear any token so subsequent steps call the API without Authorization header.
        testContext.setToken(null);
    }

    @Given("I am authenticated as an admin user")
    public void iAmAuthenticatedAsAdminUser() {
        Response response = apiClient.post(AUTH_TOKEN_PATH, Map.of(
                "username", "admin@example.com",
                "password", "Admin@P@ssw0rd"
        ));
        assertThat(response.statusCode()).isEqualTo(200);
        testContext.setToken(response.jsonPath().getString("access_token"));
    }

    // -----------------------------------------------------------------------
    // When / actions
    // -----------------------------------------------------------------------

    @When("I authenticate with username {string} and password {string}")
    public void authenticateWithCredentials(String username, String password) {
        Response response = apiClient.post(AUTH_TOKEN_PATH, Map.of(
                "username", username,
                "password", password
        ));
        testContext.setLastResponse(response);
        if (response.statusCode() == 200) {
            testContext.setToken(response.jsonPath().getString("access_token"));
        }
    }

    @When("I authenticate with invalid credentials")
    public void authenticateWithInvalidCredentials() {
        Response response = apiClient.post(AUTH_TOKEN_PATH, Map.of(
                "username", "nobody@example.com",
                "password", "wrong-password"
        ));
        testContext.setLastResponse(response);
    }

    @When("I log out")
    public void logOut() {
        Response response = apiClient.post(AUTH_LOGOUT_PATH, Map.of(
                "token", testContext.getToken()
        ));
        testContext.setLastResponse(response);
    }

    // -----------------------------------------------------------------------
    // Then / assertions
    // -----------------------------------------------------------------------

    @Then("I should receive a valid access token")
    public void iShouldReceiveAValidAccessToken() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.jsonPath().getString("access_token")).isNotBlank();
        assertThat(response.jsonPath().getString("token_type")).isEqualToIgnoringCase("Bearer");
    }

    @Then("I should receive a 401 unauthorized response")
    public void iShouldReceive401() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(401);
    }

    @Then("I should receive a 403 forbidden response")
    public void iShouldReceive403() {
        assertThat(testContext.getLastResponse().statusCode()).isEqualTo(403);
    }

    @Then("authentication should fail with invalid credentials error")
    public void authenticationShouldFailWithInvalidCredentials() {
        Response response = testContext.getLastResponse();
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.jsonPath().getString("error")).isNotBlank();
    }

    @Then("the logout should succeed")
    public void logoutShouldSucceed() {
        assertThat(testContext.getLastResponse().statusCode()).isIn(200, 204);
    }
}
