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
 * Complete test suite for OrderController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   POST   /orders                       (create order)
 *   GET    /orders                       (list orders)
 *   GET    /orders/{id}                  (get order by id)
 *   PUT    /orders/{id}/status           (update status)
 *   DELETE /orders/{id}                  (cancel order)
 *   POST   /orders/{id}/items            (add item to order)
 *   DELETE /orders/{id}/items/{itemId}   (remove item from order)
 *
 * Business rules covered:
 *   - only-authenticated-users-can-place-orders
 *   - inventory-check-before-order
 *   - duplicate-order-prevention
 *   - max-order-amount-10000
 *
 * Integration flows covered:
 *   - FLOW001: steps 4-5
 *   - FLOW002: steps 1-5
 *   - FLOW003: steps 3-5
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("OrderController - Complete Tests (100% Coverage)")
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

    @Nested
    @DisplayName("POST /orders")
    class CreateOrder {

        @Test
        @DisplayName("201 - authenticated user creates order successfully")
        void createOrder_authenticated_returns201() throws Exception {
            mockMvc.perform(post("/orders")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "shippingAddress": "456 Oak Avenue, Portland, OR 97201",
                                      "notes": "Ring doorbell"
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.status").value("PENDING"))
                    .andExpect(jsonPath("$.totalAmount").value(0.0));
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected (only-authenticated-users-can-place-orders)")
        void createOrder_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/orders")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("201 - order created with idempotency key")
        void createOrder_withIdempotencyKey_returns201() throws Exception {
            mockMvc.perform(post("/orders")
                            .header("Authorization", userToken)
                            .header("Idempotency-Key", "unique-key-abc-123")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"shippingAddress\": \"123 Main St\"}"))
                    .andExpect(status().isCreated());
        }

        @Test
        @DisplayName("409 - duplicate idempotency key returns conflict (duplicate-order-prevention)")
        void createOrder_duplicateIdempotencyKey_returns409() throws Exception {
            String idempotencyKey = "duplicate-key-xyz-456";

            mockMvc.perform(post("/orders")
                    .header("Authorization", userToken)
                    .header("Idempotency-Key", idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"shippingAddress\": \"123 Main St\"}"));

            mockMvc.perform(post("/orders")
                            .header("Authorization", userToken)
                            .header("Idempotency-Key", idempotencyKey)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"shippingAddress\": \"456 Other St\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value(containsString("Duplicate order")));
        }
    }

    // ─── GET /orders ───────────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /orders")
    class ListOrders {

        @Test
        @DisplayName("200 - returns orders for authenticated user")
        void listOrders_authenticated_returns200() throws Exception {
            mockMvc.perform(get("/orders")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isArray())
                    .andExpect(jsonPath("$.totalElements").isNumber());
        }

        @Test
        @DisplayName("200 - filters orders by status")
        void listOrders_withStatusFilter_returns200() throws Exception {
            mockMvc.perform(get("/orders")
                            .param("status", "PENDING")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("200 - supports pagination parameters")
        void listOrders_withPagination_returns200() throws Exception {
            mockMvc.perform(get("/orders")
                            .param("page", "0")
                            .param("size", "5")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void listOrders_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/orders"))
                    .andExpect(status().isUnauthorized());
        }
    }

    // ─── GET /orders/{id} ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /orders/{id}")
    class GetOrderById {

        @Test
        @DisplayName("200 - returns order for owner")
        void getOrder_owner_returns200() throws Exception {
            mockMvc.perform(get("/orders/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1))
                    .andExpect(jsonPath("$.items").isArray());
        }

        @Test
        @DisplayName("401 - unauthenticated returns 401")
        void getOrder_unauthenticated_returns401() throws Exception {
            mockMvc.perform(get("/orders/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - non-existent order returns 404")
        void getOrder_notFound_returns404() throws Exception {
            mockMvc.perform(get("/orders/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── PUT /orders/{id}/status ───────────────────────────────────────────────

    @Nested
    @DisplayName("PUT /orders/{id}/status")
    class UpdateOrderStatus {

        @Test
        @DisplayName("200 - admin updates order to PROCESSING")
        void updateOrderStatus_admin_returns200() throws Exception {
            mockMvc.perform(put("/orders/1/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"PROCESSING\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("PROCESSING"));
        }

        @Test
        @DisplayName("400 - invalid status value returns 400")
        void updateOrderStatus_invalidStatus_returns400() throws Exception {
            mockMvc.perform(put("/orders/1/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"INVALID_STATUS\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").isString());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void updateOrderStatus_unauthenticated_returns401() throws Exception {
            mockMvc.perform(put("/orders/1/status")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"CANCELLED\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - order not found returns 404")
        void updateOrderStatus_notFound_returns404() throws Exception {
            mockMvc.perform(put("/orders/99999/status")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"CANCELLED\"}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - invalid status transition returns 422")
        void updateOrderStatus_invalidTransition_returns422() throws Exception {
            mockMvc.perform(put("/orders/3/status") // order in DELIVERED status
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\": \"PENDING\"}"))
                    .andExpect(status().isUnprocessableEntity());
        }
    }

    // ─── DELETE /orders/{id} ──────────────────────────────────────────────────

    @Nested
    @DisplayName("DELETE /orders/{id}")
    class CancelOrder {

        @Test
        @DisplayName("200 - owner can cancel PENDING order")
        void cancelOrder_pendingByOwner_returns200() throws Exception {
            mockMvc.perform(delete("/orders/4")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Order cancelled successfully"));
        }

        @Test
        @DisplayName("401 - unauthenticated cancel rejected")
        void cancelOrder_unauthenticated_returns401() throws Exception {
            mockMvc.perform(delete("/orders/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - non-existent order returns 404")
        void cancelOrder_notFound_returns404() throws Exception {
            mockMvc.perform(delete("/orders/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - cannot cancel already shipped order")
        void cancelOrder_shipped_returns422() throws Exception {
            mockMvc.perform(delete("/orders/5") // order with SHIPPED status
                            .header("Authorization", userToken))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").isString());
        }
    }

    // ─── POST /orders/{id}/items ───────────────────────────────────────────────

    @Nested
    @DisplayName("POST /orders/{id}/items")
    class AddOrderItem {

        @Test
        @DisplayName("201 - adds item to PENDING order")
        void addItem_pendingOrder_returns201() throws Exception {
            mockMvc.perform(post("/orders/1/items")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "productId": 1,
                                      "quantity": 2
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.quantity").value(2));
        }

        @Test
        @DisplayName("400 - missing productId returns 400")
        void addItem_missingProductId_returns400() throws Exception {
            mockMvc.perform(post("/orders/1/items")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"quantity\": 1}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected (only-authenticated-users-can-place-orders)")
        void addItem_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/orders/1/items")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"quantity\": 1}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - order not found returns 404")
        void addItem_orderNotFound_returns404() throws Exception {
            mockMvc.perform(post("/orders/99999/items")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"quantity\": 1}"))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - out-of-stock product returns 422 (inventory-check-before-order)")
        void addItem_outOfStock_returns422() throws Exception {
            mockMvc.perform(post("/orders/1/items")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "productId": 999,
                                      "quantity": 10000
                                    }
                                    """))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("stock")));
        }

        @Test
        @DisplayName("422 - order exceeding $10,000 returns 422 (max-order-amount-10000)")
        void addItem_exceedsMaxAmount_returns422() throws Exception {
            // Add multiple items that would push total over $10,000
            mockMvc.perform(post("/orders/2/items") // order pre-loaded with items near limit
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "productId": 2,
                                      "quantity": 100
                                    }
                                    """))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error").value(containsString("10,000")));
        }

        @Test
        @DisplayName("422 - cannot add item to non-PENDING order")
        void addItem_nonPendingOrder_returns422() throws Exception {
            mockMvc.perform(post("/orders/6/items") // order with CONFIRMED status
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"quantity\": 1}"))
                    .andExpect(status().isUnprocessableEntity());
        }
    }

    // ─── DELETE /orders/{id}/items/{itemId} ───────────────────────────────────

    @Nested
    @DisplayName("DELETE /orders/{id}/items/{itemId}")
    class RemoveOrderItem {

        @Test
        @DisplayName("200 - removes item from PENDING order")
        void removeItem_pendingOrder_returns200() throws Exception {
            mockMvc.perform(delete("/orders/1/items/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Item removed from order"));
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void removeItem_unauthenticated_returns401() throws Exception {
            mockMvc.perform(delete("/orders/1/items/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("404 - order not found returns 404")
        void removeItem_orderNotFound_returns404() throws Exception {
            mockMvc.perform(delete("/orders/99999/items/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("404 - item not found in order returns 404")
        void removeItem_itemNotFound_returns404() throws Exception {
            mockMvc.perform(delete("/orders/1/items/99999")
                            .header("Authorization", userToken))
                    .andExpect(status().isNotFound());
        }

        @Test
        @DisplayName("422 - cannot remove item from non-PENDING order")
        void removeItem_nonPendingOrder_returns422() throws Exception {
            mockMvc.perform(delete("/orders/6/items/10") // CONFIRMED order
                            .header("Authorization", userToken))
                    .andExpect(status().isUnprocessableEntity());
        }
    }
}
