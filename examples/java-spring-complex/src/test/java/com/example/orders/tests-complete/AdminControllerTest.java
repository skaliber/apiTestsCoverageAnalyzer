package com.example.orders.tests_complete;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

/**
 * Complete test suite for AdminController — 100% endpoint coverage.
 *
 * Endpoints covered:
 *   GET /admin/health     (system health)
 *   GET /admin/metrics    (system metrics)
 *
 * Integration flows covered:
 *   - FLOW005: steps 6-7
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("AdminController - Complete Tests (100% Coverage)")
class AdminControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() {
        adminToken = "Bearer test-admin-jwt-token";
        userToken = "Bearer test-user-jwt-token";
    }

    // ─── GET /admin/health ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /admin/health")
    class GetHealth {

        @Test
        @DisplayName("200 - admin receives health status")
        void getHealth_asAdmin_returns200() throws Exception {
            mockMvc.perform(get("/admin/health")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("UP"))
                    .andExpect(jsonPath("$.timestamp").isString())
                    .andExpect(jsonPath("$.version").isString())
                    .andExpect(jsonPath("$.components").isMap())
                    .andExpect(jsonPath("$.components.database").value("UP"));
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void getHealth_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/admin/health"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin user is forbidden")
        void getHealth_nonAdmin_returns403() throws Exception {
            mockMvc.perform(get("/admin/health")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }
    }

    // ─── GET /admin/metrics ────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /admin/metrics")
    class GetMetrics {

        @Test
        @DisplayName("200 - admin receives system metrics")
        void getMetrics_asAdmin_returns200() throws Exception {
            mockMvc.perform(get("/admin/metrics")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.timestamp").isString())
                    .andExpect(jsonPath("$.uptimeMs").isNumber())
                    .andExpect(jsonPath("$.memory").isMap())
                    .andExpect(jsonPath("$.memory.heapUsed").isNumber())
                    .andExpect(jsonPath("$.memory.heapMax").isNumber())
                    .andExpect(jsonPath("$.jvm").isMap())
                    .andExpect(jsonPath("$.jvm.version").isString())
                    .andExpect(jsonPath("$.jvm.threads").isNumber())
                    .andExpect(jsonPath("$.application").isMap())
                    .andExpect(jsonPath("$.application.totalOrders").isNumber());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void getMetrics_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/admin/metrics"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin is forbidden from metrics")
        void getMetrics_nonAdmin_returns403() throws Exception {
            mockMvc.perform(get("/admin/metrics")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }
    }
}
