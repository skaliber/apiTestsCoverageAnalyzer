package com.example.orders.tests_complete;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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
 * Complete test suite for UserController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   POST   /users              (create user)
 *   GET    /users              (list users - admin)
 *   GET    /users/{id}         (get user by id)
 *   PUT    /users/{id}         (update user)
 *   DELETE /users/{id}         (delete user - admin)
 *
 * Business rules covered:
 *   - user-deletion-requires-admin
 *
 * Integration flows covered:
 *   - FLOW004: User Registration and First Purchase (step 1)
 *   - FLOW005: Admin Operations (steps 1-4)
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("UserController - Complete Tests (100% Coverage)")
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String adminToken;
    private String userToken;
    private String otherUserToken;

    @BeforeEach
    void setUp() {
        adminToken = "Bearer test-admin-jwt-token";
        userToken = "Bearer test-user-jwt-token";
        otherUserToken = "Bearer test-other-user-jwt-token";
    }

    // ─── POST /users ───────────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /users")
    class CreateUser {

        @Test
        @DisplayName("201 - should create user with valid data")
        void createUser_validData_returns201() throws Exception {
            String requestBody = """
                    {
                      "name": "Jane Doe",
                      "email": "jane.doe.unique@example.com",
                      "password": "Secure@Pass123"
                    }
                    """;

            mockMvc.perform(post("/users")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.name").value("Jane Doe"))
                    .andExpect(jsonPath("$.email").value("jane.doe.unique@example.com"))
                    .andExpect(jsonPath("$.role").value("CUSTOMER"))
                    .andExpect(jsonPath("$.passwordHash").doesNotExist());
        }

        @Test
        @DisplayName("400 - should return bad request when name is blank")
        void createUser_blankName_returns400() throws Exception {
            String requestBody = """
                    {
                      "name": "",
                      "email": "test@example.com",
                      "password": "Password@1"
                    }
                    """;

            mockMvc.perform(post("/users")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("400 - should return bad request for invalid email format")
        void createUser_invalidEmail_returns400() throws Exception {
            String requestBody = """
                    {
                      "name": "Test User",
                      "email": "not-an-email",
                      "password": "Password@1"
                    }
                    """;

            mockMvc.perform(post("/users")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("400 - should return bad request when password too short")
        void createUser_shortPassword_returns400() throws Exception {
            String requestBody = """
                    {
                      "name": "Test User",
                      "email": "test2@example.com",
                      "password": "abc"
                    }
                    """;

            mockMvc.perform(post("/users")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("409 - should return conflict when email already in use")
        void createUser_duplicateEmail_returns409() throws Exception {
            String requestBody = """
                    {
                      "name": "Duplicate User",
                      "email": "duplicate@example.com",
                      "password": "Password@1"
                    }
                    """;

            mockMvc.perform(post("/users")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestBody));

            mockMvc.perform(post("/users")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(requestBody))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").isString());
        }
    }

    // ─── GET /users ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /users")
    class ListUsers {

        @Test
        @DisplayName("200 - admin should get all users")
        void listUsers_asAdmin_returns200() throws Exception {
            mockMvc.perform(get("/users")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$").isArray());
        }

        @Test
        @DisplayName("200 - admin should filter users by email")
        void listUsers_withEmailFilter_returns200() throws Exception {
            mockMvc.perform(get("/users")
                            .param("email", "jane")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$").isArray());
        }

        @Test
        @DisplayName("401 - unauthenticated request should be rejected")
        void listUsers_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/users"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin should be forbidden")
        void listUsers_asNonAdmin_returns403() throws Exception {
            mockMvc.perform(get("/users")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }
    }

    // ─── GET /users/{id} ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /users/{id}")
    class GetUserById {

        @Test
        @DisplayName("200 - admin should get any user")
        void getUserById_asAdmin_returns200() throws Exception {
            mockMvc.perform(get("/users/1")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1));
        }

        @Test
        @DisplayName("200 - user should get their own profile")
        void getUserById_ownProfile_returns200() throws Exception {
            mockMvc.perform(get("/users/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("401 - unauthenticated request should be rejected")
        void getUserById_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/users/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - user should not access another user's profile")
        void getUserById_otherUser_returns403() throws Exception {
            mockMvc.perform(get("/users/2")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - should return not found for unknown ID")
        void getUserById_notFound_returns404() throws Exception {
            mockMvc.perform(get("/users/99999")
                            .header("Authorization", adminToken))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── PUT /users/{id} ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("PUT /users/{id}")
    class UpdateUser {

        @Test
        @DisplayName("200 - user should update their own name")
        void updateUser_ownName_returns200() throws Exception {
            String updateBody = """
                    { "name": "Jane Updated" }
                    """;

            mockMvc.perform(put("/users/1")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(updateBody))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.name").value("Jane Updated"));
        }

        @Test
        @DisplayName("200 - admin should update any user")
        void updateUser_asAdmin_returns200() throws Exception {
            String updateBody = """
                    { "name": "Admin Updated User" }
                    """;

            mockMvc.perform(put("/users/1")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(updateBody))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("400 - should return bad request for invalid email on update")
        void updateUser_invalidEmail_returns400() throws Exception {
            String updateBody = """
                    { "email": "not-an-email" }
                    """;

            mockMvc.perform(put("/users/1")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(updateBody))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("401 - unauthenticated update should be rejected")
        void updateUser_unauthenticated_returns401() throws Exception {
            mockMvc.perform(put("/users/1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - user should not update another user's profile")
        void updateUser_otherUser_returns403() throws Exception {
            mockMvc.perform(put("/users/2")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{ \"name\": \"Hacker\" }"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - should return not found for unknown ID")
        void updateUser_notFound_returns404() throws Exception {
            mockMvc.perform(put("/users/99999")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{ \"name\": \"Ghost\" }"))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── DELETE /users/{id} ────────────────────────────────────────────────────

    @Nested
    @DisplayName("DELETE /users/{id}")
    class DeleteUser {

        @Test
        @DisplayName("200 - admin should delete user (business rule: user-deletion-requires-admin)")
        void deleteUser_asAdmin_returns200() throws Exception {
            mockMvc.perform(delete("/users/2")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("User deleted successfully"));
        }

        @Test
        @DisplayName("401 - unauthenticated delete should be rejected")
        void deleteUser_unauthenticated_returns401() throws Exception {
            mockMvc.perform(delete("/users/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin delete should be forbidden (user-deletion-requires-admin)")
        void deleteUser_asNonAdmin_returns403() throws Exception {
            mockMvc.perform(delete("/users/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - should return not found for unknown user")
        void deleteUser_notFound_returns404() throws Exception {
            mockMvc.perform(delete("/users/99999")
                            .header("Authorization", adminToken))
                    .andExpect(status().isNotFound());
        }
    }
}
