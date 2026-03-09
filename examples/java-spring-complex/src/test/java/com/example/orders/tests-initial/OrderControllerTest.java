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

/**
 * Initial (partial) test suite for OrderController.
 *
 * COVERAGE GAPS (intentional for demo):
 *   - Missing: PUT /orders/{id}/status
 *   - Missing: POST /orders/{id}/items (inventory checks)
 *   - Missing: DELETE /orders/{id}/items/{itemId}
 *   - Missing: max-order-amount-10000 business rule
 *   - Missing: duplicate-order-prevention business rule
 *   - Missing: inventory-check-before-order business rule
 *
 * Current coverage: ~50% of order endpoints
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("OrderController - Initial Tests (Partial Coverage)")
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String userToken;
    private String adminToken;

    @BeforeEach
    void setUp() {
        userToken = "Bearer test-user-jwt-token";
        adminToken = "Bearer test-admin-jwt-token";
    }

    // ─── POST /orders ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /orders - should create order for authenticated user")
    void createOrder_authenticated_success() throws Exception {
        String requestBody = """
                {
                  "shippingAddress": "123 Main St, Springfield, IL 62701",
                  "notes": "Please leave at front door"
                }
                """;

        mockMvc.perform(post("/orders")
                        .header("Authorization", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    @DisplayName("POST /orders - should return 401 for unauthenticated request")
    void createOrder_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    // ─── GET /orders ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /orders - should return orders for current user")
    void listOrders_authenticated() throws Exception {
        mockMvc.perform(get("/orders")
                        .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    @DisplayName("GET /orders - should return 401 when not authenticated")
    void listOrders_unauthenticated() throws Exception {
        mockMvc.perform(get("/orders"))
                .andExpect(status().isUnauthorized());
    }

    // ─── GET /orders/{id} ─────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /orders/{id} - should return order for owner")
    void getOrderById_owner_success() throws Exception {
        mockMvc.perform(get("/orders/1")
                        .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    @DisplayName("GET /orders/{id} - should return 404 for non-existent order")
    void getOrderById_notFound() throws Exception {
        mockMvc.perform(get("/orders/99999")
                        .header("Authorization", userToken))
                .andExpect(status().isNotFound());
    }

    // ─── DELETE /orders/{id} ──────────────────────────────────────────────────

    @Test
    @DisplayName("DELETE /orders/{id} - should cancel PENDING order")
    void cancelOrder_pending_success() throws Exception {
        mockMvc.perform(delete("/orders/1")
                        .header("Authorization", userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Order cancelled successfully"));
    }

    // NOTE: Missing tests for:
    // - PUT /orders/{id}/status
    // - POST /orders/{id}/items (add item)
    // - DELETE /orders/{id}/items/{itemId} (remove item)
    // - Business rules: duplicate-order-prevention, inventory-check, max-amount
    // - Error paths: cancelling shipped/delivered orders
}
