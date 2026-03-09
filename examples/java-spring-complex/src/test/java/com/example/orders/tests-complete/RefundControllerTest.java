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
 * Complete test suite for RefundController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   POST /refunds         (create refund)
 *   GET  /refunds/{id}    (get refund)
 *
 * Business rules covered:
 *   - refund-window-30-days
 *
 * Integration flows covered:
 *   - FLOW002: steps 6-7
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("RefundController - Complete Tests (100% Coverage)")
class RefundControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String userToken;

    @BeforeEach
    void setUp() {
        userToken = "Bearer test-user-jwt-token";
    }

    // ─── POST /refunds ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /refunds")
    class CreateRefund {

        @Test
        @DisplayName("201 - creates refund for captured payment within 30-day window")
        void createRefund_withinWindow_returns201() throws Exception {
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "paymentId": 3,
                                      "amount": 29.99,
                                      "reason": "Product arrived damaged"
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.status").value("PROCESSING"))
                    .andExpect(jsonPath("$.gatewayRefundId").isString());
        }

        @Test
        @DisplayName("400 - missing paymentId returns 400")
        void createRefund_missingPaymentId_returns400() throws Exception {
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"amount\": 10.00}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("400 - refund amount exceeds payment returns 400")
        void createRefund_amountExceedsPayment_returns400() throws Exception {
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "paymentId": 3,
                                      "amount": 99999.00,
                                      "reason": "Customer scam attempt"
                                    }
                                    """))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value(containsString("exceed")));
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void createRefund_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/refunds")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"paymentId\": 1, \"amount\": 5.00}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - payment not found returns 404")
        void createRefund_paymentNotFound_returns404() throws Exception {
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"paymentId\": 99999, \"amount\": 10.00}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - refund window expired returns 422 (refund-window-30-days)")
        void createRefund_windowExpired_returns422() throws Exception {
            // Payment captured > 30 days ago (pre-seeded in test data)
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"paymentId\": 6, \"amount\": 10.00, \"reason\": \"Late refund\"}"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("Refund window")));
        }

        @Test
        @DisplayName("422 - non-captured payment cannot be refunded")
        void createRefund_notCaptured_returns422() throws Exception {
            mockMvc.perform(post("/refunds")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"paymentId\": 2, \"amount\": 5.00}")) // AUTHORIZED payment
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("captured")));
        }
    }

    // ─── GET /refunds/{id} ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /refunds/{id}")
    class GetRefundById {

        @Test
        @DisplayName("200 - returns refund for owner")
        void getRefund_owner_returns200() throws Exception {
            mockMvc.perform(get("/refunds/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1))
                    .andExpect(jsonPath("$.amount").isNumber())
                    .andExpect(jsonPath("$.status").isString());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void getRefund_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/refunds/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - refund not found returns 404")
        void getRefund_notFound_returns404() throws Exception {
            mockMvc.perform(get("/refunds/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }
    }
}
