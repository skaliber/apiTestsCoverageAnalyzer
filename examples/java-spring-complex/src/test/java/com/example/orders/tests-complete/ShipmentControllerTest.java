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
 * Complete test suite for ShipmentController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   GET /shipments/{id}           (get shipment)
 *   PUT /shipments/{id}/status    (update shipment status)
 *
 * Business rules covered:
 *   - payment-required-before-shipment
 *
 * Integration flows covered:
 *   - FLOW001: steps 8-10
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("ShipmentController - Complete Tests (100% Coverage)")
class ShipmentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String userToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        userToken = "Bearer test-user-jwt-token";
        adminToken = "Bearer test-admin-jwt-token";
    }

    // ─── GET /shipments/{id} ───────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /shipments/{id}")
    class GetShipmentById {

        @Test
        @DisplayName("200 - returns shipment details for order owner")
        void getShipment_owner_returns200() throws Exception {
            mockMvc.perform(get("/shipments/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1))
                    .andExpect(jsonPath("$.status").isString());
        }

        @Test
        @DisplayName("200 - admin can retrieve any shipment")
        void getShipment_admin_returns200() throws Exception {
            mockMvc.perform(get("/shipments/1")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void getShipment_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/shipments/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - shipment not found returns 404")
        void getShipment_notFound_returns404() throws Exception {
            mockMvc.perform(get("/shipments/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── PUT /shipments/{id}/status ────────────────────────────────────────────

    @Nested
    @DisplayName("PUT /shipments/{id}/status")
    class UpdateShipmentStatus {

        @Test
        @DisplayName("200 - admin marks shipment as SHIPPED (payment-required-before-shipment)")
        void updateStatus_toShipped_withCapturedPayment_returns200() throws Exception {
            mockMvc.perform(put("/shipments/1/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "status": "SHIPPED",
                                      "trackingNumber": "1Z999AA10123456784",
                                      "carrier": "UPS"
                                    }
                                    """))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("SHIPPED"))
                    .andExpect(jsonPath("$.trackingNumber").value("1Z999AA10123456784"))
                    .andExpect(jsonPath("$.carrier").value("UPS"));
        }

        @Test
        @DisplayName("200 - admin marks shipment as DELIVERED")
        void updateStatus_toDelivered_returns200() throws Exception {
            mockMvc.perform(put("/shipments/2/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"DELIVERED\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("DELIVERED"));
        }

        @Test
        @DisplayName("400 - invalid status value returns 400")
        void updateStatus_invalidStatus_returns400() throws Exception {
            mockMvc.perform(put("/shipments/1/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"FLYING\"}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void updateStatus_unauthenticated_returns401() throws Exception {
            mockMvc.perform(put("/shipments/1/status")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"SHIPPED\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin cannot update shipment status")
        void updateStatus_nonAdmin_returns403() throws Exception {
            mockMvc.perform(put("/shipments/1/status")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"SHIPPED\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - shipment not found returns 404")
        void updateStatus_notFound_returns404() throws Exception {
            mockMvc.perform(put("/shipments/99999/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"SHIPPED\"}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - shipping without captured payment returns 422 (payment-required-before-shipment)")
        void updateStatus_shippedWithoutCapturedPayment_returns422() throws Exception {
            // Shipment 3 is linked to an order with an AUTHORIZED (not captured) payment
            mockMvc.perform(put("/shipments/3/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"SHIPPED\"}"))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("Payment must be captured")));
        }
    }
}
