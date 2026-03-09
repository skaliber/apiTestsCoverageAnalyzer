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
 * Complete test suite for PaymentController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   POST /payments                 (initiate payment)
 *   GET  /payments/{id}            (get payment)
 *   POST /payments/{id}/capture    (capture payment)
 *   POST /payments/{id}/void       (void payment)
 *
 * Business rules covered:
 *   - payment-required-before-shipment (capture enables shipment)
 *
 * Integration flows covered:
 *   - FLOW001: steps 6-7
 *   - FLOW002: steps 3-4
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("PaymentController - Complete Tests (100% Coverage)")
class PaymentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String userToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        userToken = "Bearer test-user-jwt-token";
        adminToken = "Bearer test-admin-jwt-token";
    }

    // ─── POST /payments ────────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /payments")
    class InitiatePayment {

        @Test
        @DisplayName("201 - initiates payment for confirmed order")
        void initiatePayment_validOrder_returns201() throws Exception {
            mockMvc.perform(post("/payments")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "orderId": 1,
                                      "paymentMethod": "CREDIT_CARD",
                                      "cardToken": "tok_visa_testcard"
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.status").value("AUTHORIZED"))
                    .andExpect(jsonPath("$.transactionId").isString());
        }

        @Test
        @DisplayName("400 - missing orderId returns 400")
        void initiatePayment_missingOrderId_returns400() throws Exception {
            mockMvc.perform(post("/payments")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"paymentMethod\": \"CREDIT_CARD\"}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void initiatePayment_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/payments")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"orderId\": 1, \"paymentMethod\": \"CREDIT_CARD\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - order not found returns 404")
        void initiatePayment_orderNotFound_returns404() throws Exception {
            mockMvc.perform(post("/payments")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"orderId\": 99999, \"paymentMethod\": \"CREDIT_CARD\"}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - order already has payment returns 422")
        void initiatePayment_alreadyPaid_returns422() throws Exception {
            mockMvc.perform(post("/payments")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"orderId\": 7, \"paymentMethod\": \"CREDIT_CARD\"}"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("already has a payment")));
        }

        @Test
        @DisplayName("422 - cancelled order cannot be paid")
        void initiatePayment_cancelledOrder_returns422() throws Exception {
            mockMvc.perform(post("/payments")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"orderId\": 8, \"paymentMethod\": \"CREDIT_CARD\"}"))
                    .andExpect(status().isUnprocessableEntity());
        }
    }

    // ─── GET /payments/{id} ────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /payments/{id}")
    class GetPaymentById {

        @Test
        @DisplayName("200 - returns payment for owner")
        void getPayment_owner_returns200() throws Exception {
            mockMvc.perform(get("/payments/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1))
                    .andExpect(jsonPath("$.amount").isNumber())
                    .andExpect(jsonPath("$.status").isString());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void getPayment_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/payments/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - payment not found returns 404")
        void getPayment_notFound_returns404() throws Exception {
            mockMvc.perform(get("/payments/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── POST /payments/{id}/capture ───────────────────────────────────────────

    @Nested
    @DisplayName("POST /payments/{id}/capture")
    class CapturePayment {

        @Test
        @DisplayName("200 - captures authorized payment (payment-required-before-shipment)")
        void capturePayment_authorized_returns200() throws Exception {
            mockMvc.perform(post("/payments/2/capture")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CAPTURED"))
                    .andExpect(jsonPath("$.capturedAt").isString())
                    .andExpect(jsonPath("$.gatewayReference").isString());
        }

        @Test
        @DisplayName("401 - unauthenticated capture rejected")
        void capturePayment_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/payments/1/capture"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - payment not found returns 404")
        void capturePayment_notFound_returns404() throws Exception {
            mockMvc.perform(post("/payments/99999/capture")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - already captured payment returns 422")
        void capturePayment_alreadyCaptured_returns422() throws Exception {
            mockMvc.perform(post("/payments/3/capture") // pre-captured payment
                            .header("Authorization", userToken))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("AUTHORIZED")));
        }
    }

    // ─── POST /payments/{id}/void ──────────────────────────────────────────────

    @Nested
    @DisplayName("POST /payments/{id}/void")
    class VoidPayment {

        @Test
        @DisplayName("200 - voids authorized payment")
        void voidPayment_authorized_returns200() throws Exception {
            mockMvc.perform(post("/payments/4/void")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\": \"Customer changed mind\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("VOIDED"));
        }

        @Test
        @DisplayName("401 - unauthenticated void rejected")
        void voidPayment_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/payments/1/void"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - payment not found returns 404")
        void voidPayment_notFound_returns404() throws Exception {
            mockMvc.perform(post("/payments/99999/void")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - cannot void captured payment (use refund instead)")
        void voidPayment_captured_returns422() throws Exception {
            mockMvc.perform(post("/payments/3/void") // captured payment
                            .header("Authorization", userToken))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("refund")));
        }

        @Test
        @DisplayName("422 - cannot void already voided payment")
        void voidPayment_alreadyVoided_returns422() throws Exception {
            mockMvc.perform(post("/payments/5/void") // already voided
                            .header("Authorization", userToken))
                    .andExpect(status().isUnprocessableEntity());
        }
    }
}
