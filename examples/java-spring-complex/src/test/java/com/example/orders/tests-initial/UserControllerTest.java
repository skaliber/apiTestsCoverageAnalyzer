package com.example.orders.tests_initial;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

/**
 * Initial (partial) test suite for UserController.
 *
 * COVERAGE GAPS (intentional for demo):
 *   - Missing: GET /users (list all - admin endpoint)
 *   - Missing: DELETE /users/{id}
 *   - Missing: 400 validation errors on POST /users
 *   - Missing: 403 access-denied scenarios
 *
 * Current coverage: ~60% of user endpoints
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("UserController - Initial Tests (Partial Coverage)")
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() {
        // In a real setup, these would be obtained from the auth endpoint
        adminToken = "Bearer test-admin-jwt-token";
        userToken = "Bearer test-user-jwt-token";
    }

    // ─── POST /users ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /users - should create user successfully")
    void createUser_success() throws Exception {
        String requestBody = """
                {
                  "name": "Alice Johnson",
                  "email": "alice@example.com",
                  "password": "Secure@123"
                }
                """;

        mockMvc.perform(post("/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Alice Johnson"))
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.role").value("CUSTOMER"));
    }

    @Test
    @DisplayName("POST /users - should return 409 when email already exists")
    void createUser_duplicateEmail() throws Exception {
        String requestBody = """
                {
                  "name": "Bob Smith",
                  "email": "existing@example.com",
                  "password": "Password@1"
                }
                """;

        // First create
        mockMvc.perform(post("/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody));

        // Attempt duplicate
        mockMvc.perform(post("/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isConflict());
    }

    // ─── GET /users/{id} ───────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /users/{id} - should return user for valid ID")
    void getUserById_found() throws Exception {
        mockMvc.perform(get("/users/1")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.email").isString());
    }

    @Test
    @DisplayName("GET /users/{id} - should return 404 for non-existent user")
    void getUserById_notFound() throws Exception {
        mockMvc.perform(get("/users/99999")
                        .header("Authorization", adminToken))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /users/{id} - should return 401 when not authenticated")
    void getUserById_unauthenticated() throws Exception {
        mockMvc.perform(get("/users/1"))
                .andExpect(status().isUnauthorized());
    }

    // ─── PUT /users/{id} ───────────────────────────────────────────────────────

    @Test
    @DisplayName("PUT /users/{id} - should update user name")
    void updateUser_success() throws Exception {
        String updateBody = """
                {
                  "name": "Alice Updated"
                }
                """;

        mockMvc.perform(put("/users/1")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Alice Updated"));
    }

    // NOTE: Missing tests for:
    // - GET /users (list all users - admin)
    // - DELETE /users/{id}
    // - POST /users with invalid data (400 validation)
    // - PUT /users/{id} accessing another user's account (403)
}
