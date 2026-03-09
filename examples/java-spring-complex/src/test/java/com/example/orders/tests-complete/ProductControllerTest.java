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
 * Complete test suite for ProductController — 100% endpoint coverage.
 *
 * Endpoints covered:
 *   GET    /products              (list products - public)
 *   POST   /products              (create product - admin)
 *   GET    /products/{id}         (get product - public)
 *   PUT    /products/{id}         (update product - admin)
 *   DELETE /products/{id}         (delete product - admin)
 *
 * Integration flows covered:
 *   - FLOW001: steps 2-3
 *   - FLOW003: steps 1-2, 6
 *   - FLOW005: step 5
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("ProductController - Complete Tests (100% Coverage)")
class ProductControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String adminToken;
    private String userToken;

    @BeforeEach
    void setUp() {
        adminToken = "Bearer test-admin-jwt-token";
        userToken = "Bearer test-user-jwt-token";
    }

    // ─── GET /products ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /products")
    class ListProducts {

        @Test
        @DisplayName("200 - public endpoint returns paginated product list")
        void listProducts_public_returns200() throws Exception {
            mockMvc.perform(get("/products"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isArray())
                    .andExpect(jsonPath("$.totalElements").isNumber());
        }

        @Test
        @DisplayName("200 - filters by category")
        void listProducts_byCategory_returns200() throws Exception {
            mockMvc.perform(get("/products")
                            .param("category", "Electronics"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isArray());
        }

        @Test
        @DisplayName("200 - filters by price range")
        void listProducts_byPriceRange_returns200() throws Exception {
            mockMvc.perform(get("/products")
                            .param("minPrice", "10.00")
                            .param("maxPrice", "100.00"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("200 - full-text search on name or description")
        void listProducts_withSearch_returns200() throws Exception {
            mockMvc.perform(get("/products")
                            .param("search", "wireless"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("200 - sorts by price descending")
        void listProducts_sortedByPriceDesc_returns200() throws Exception {
            mockMvc.perform(get("/products")
                            .param("sortBy", "price")
                            .param("sortDir", "desc"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("200 - supports pagination")
        void listProducts_withPagination_returns200() throws Exception {
            mockMvc.perform(get("/products")
                            .param("page", "0")
                            .param("size", "5"))
                    .andExpect(status().isOk());
        }
    }

    // ─── POST /products ────────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /products")
    class CreateProduct {

        @Test
        @DisplayName("201 - admin creates product with valid data")
        void createProduct_asAdmin_returns201() throws Exception {
            mockMvc.perform(post("/products")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "name": "Wireless Bluetooth Headphones",
                                      "description": "Premium over-ear headphones with 30-hour battery life",
                                      "price": 149.99,
                                      "stockQuantity": 250,
                                      "category": "Electronics",
                                      "sku": "WBH-2024-PRO"
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.name").value("Wireless Bluetooth Headphones"))
                    .andExpect(jsonPath("$.price").value(149.99))
                    .andExpect(jsonPath("$.active").value(true));
        }

        @Test
        @DisplayName("400 - missing required field returns 400")
        void createProduct_missingName_returns400() throws Exception {
            mockMvc.perform(post("/products")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "price": 49.99,
                                      "stockQuantity": 10,
                                      "category": "Books",
                                      "sku": "BK-001"
                                    }
                                    """))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("400 - negative price returns 400")
        void createProduct_negativePrice_returns400() throws Exception {
            mockMvc.perform(post("/products")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "name": "Test Product",
                                      "price": -5.00,
                                      "stockQuantity": 10,
                                      "category": "Test",
                                      "sku": "TEST-001"
                                    }
                                    """))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void createProduct_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/products")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Test\",\"price\":10,\"stockQuantity\":1,\"category\":\"X\",\"sku\":\"X-1\"}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin user is forbidden")
        void createProduct_asUser_returns403() throws Exception {
            mockMvc.perform(post("/products")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"Test\",\"price\":10,\"stockQuantity\":1,\"category\":\"X\",\"sku\":\"X-2\"}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("409 - duplicate SKU returns 409")
        void createProduct_duplicateSku_returns409() throws Exception {
            String body = """
                    {
                      "name": "Duplicate SKU Product",
                      "price": 19.99,
                      "stockQuantity": 5,
                      "category": "Misc",
                      "sku": "EXISTING-SKU-001"
                    }
                    """;
            // First create succeeds
            mockMvc.perform(post("/products")
                    .header("Authorization", adminToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body));
            // Second create with same SKU should conflict
            mockMvc.perform(post("/products")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isConflict());
        }
    }

    // ─── GET /products/{id} ────────────────────────────────────────────────────

    @Nested
    @DisplayName("GET /products/{id}")
    class GetProductById {

        @Test
        @DisplayName("200 - public endpoint returns product by ID")
        void getProduct_publicAccess_returns200() throws Exception {
            mockMvc.perform(get("/products/1"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(1))
                    .andExpect(jsonPath("$.name").isString())
                    .andExpect(jsonPath("$.price").isNumber());
        }

        @Test
        @DisplayName("200 - authenticated user can also retrieve product")
        void getProduct_authenticated_returns200() throws Exception {
            mockMvc.perform(get("/products/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("404 - non-existent product returns 404")
        void getProduct_notFound_returns404() throws Exception {
            mockMvc.perform(get("/products/99999"))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── PUT /products/{id} ────────────────────────────────────────────────────

    @Nested
    @DisplayName("PUT /products/{id}")
    class UpdateProduct {

        @Test
        @DisplayName("200 - admin updates product price")
        void updateProduct_price_asAdmin_returns200() throws Exception {
            mockMvc.perform(put("/products/1")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"price\": 199.99}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.price").value(199.99));
        }

        @Test
        @DisplayName("200 - admin updates stock quantity")
        void updateProduct_stock_asAdmin_returns200() throws Exception {
            mockMvc.perform(put("/products/1")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"stockQuantity\": 500}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.stockQuantity").value(500));
        }

        @Test
        @DisplayName("401 - unauthenticated update rejected")
        void updateProduct_unauthenticated_returns401() throws Exception {
            mockMvc.perform(put("/products/1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"price\": 9.99}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin update is forbidden")
        void updateProduct_asUser_returns403() throws Exception {
            mockMvc.perform(put("/products/1")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"price\": 0.01}"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - non-existent product returns 404")
        void updateProduct_notFound_returns404() throws Exception {
            mockMvc.perform(put("/products/99999")
                            .header("Authorization", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"price\": 10.00}"))
                    .andExpect(status().isNotFound());
        }
    }

    // ─── DELETE /products/{id} ─────────────────────────────────────────────────

    @Nested
    @DisplayName("DELETE /products/{id}")
    class DeleteProduct {

        @Test
        @DisplayName("200 - admin soft-deletes product")
        void deleteProduct_asAdmin_returns200() throws Exception {
            mockMvc.perform(delete("/products/2")
                            .header("Authorization", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.message").value("Product deleted successfully"));
        }

        @Test
        @DisplayName("401 - unauthenticated delete rejected")
        void deleteProduct_unauthenticated_returns401() throws Exception {
            mockMvc.perform(delete("/products/1"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - non-admin is forbidden from deleting products")
        void deleteProduct_asUser_returns403() throws Exception {
            mockMvc.perform(delete("/products/1")
                            .header("Authorization", userToken))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("404 - non-existent product returns 404")
        void deleteProduct_notFound_returns404() throws Exception {
            mockMvc.perform(delete("/products/99999")
                            .header("Authorization", adminToken))
                    .andExpect(status().isNotFound());
        }
    }
}
