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
 * Complete test suite for ReviewController — 100% endpoint + business rule coverage.
 *
 * Endpoints covered:
 *   POST /reviews                  (create review)
 *   GET  /products/{id}/reviews    (list product reviews)
 *
 * Business rules covered:
 *   - review-requires-completed-order
 *
 * Integration flows covered:
 *   - FLOW004: steps 6-8
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DisplayName("ReviewController - Complete Tests (100% Coverage)")
class ReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    private String userToken;
    private String newUserToken;

    @BeforeEach
    void setUp() {
        userToken = "Bearer test-user-jwt-token";        // user with completed orders
        newUserToken = "Bearer test-newuser-jwt-token";  // user without completed orders
    }

    // ─── POST /reviews ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("POST /reviews")
    class CreateReview {

        @Test
        @DisplayName("201 - creates review with valid rating and completed order")
        void createReview_validRating_returns201() throws Exception {
            mockMvc.perform(post("/reviews")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {
                                      "productId": 1,
                                      "orderId": 3,
                                      "rating": 5,
                                      "comment": "Excellent product! Fast delivery and exactly as described."
                                    }
                                    """))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").isNumber())
                    .andExpect(jsonPath("$.rating").value(5))
                    .andExpect(jsonPath("$.author").isString());
        }

        @Test
        @DisplayName("201 - creates review with minimum rating of 1")
        void createReview_minimumRating_returns201() throws Exception {
            mockMvc.perform(post("/reviews")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"orderId\": 3, \"rating\": 1, \"comment\": \"Disappointing.\"}"))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.rating").value(1));
        }

        @Test
        @DisplayName("400 - rating below 1 returns 400")
        void createReview_ratingBelowMin_returns400() throws Exception {
            mockMvc.perform(post("/reviews")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"orderId\": 3, \"rating\": 0}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value(containsString("Rating")));
        }

        @Test
        @DisplayName("400 - rating above 5 returns 400")
        void createReview_ratingAboveMax_returns400() throws Exception {
            mockMvc.perform(post("/reviews")
                            .header("Authorization", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"orderId\": 3, \"rating\": 6}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value(containsString("Rating")));
        }

        @Test
        @DisplayName("401 - unauthenticated request rejected")
        void createReview_unauthenticated_returns401() throws Exception {
            mockMvc.perform(post("/reviews")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"orderId\": 3, \"rating\": 4}"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @DisplayName("403 - user without completed order cannot review (review-requires-completed-order)")
        void createReview_noCompletedOrder_returns403() throws Exception {
            mockMvc.perform(post("/reviews")
                            .header("Authorization", newUserToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\": 1, \"orderId\": 99, \"rating\": 4}"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value(containsString("completed order")));
        }
    }

    // ─── GET /products/{id}/reviews ────────────────────────────────────────────

    @Nested
    @DisplayName("GET /products/{id}/reviews")
    class GetProductReviews {

        @Test
        @DisplayName("200 - returns reviews for existing product (public)")
        void getProductReviews_existingProduct_returns200() throws Exception {
            mockMvc.perform(get("/products/1/reviews"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isArray())
                    .andExpect(jsonPath("$.totalElements").isNumber());
        }

        @Test
        @DisplayName("200 - supports pagination parameters")
        void getProductReviews_withPagination_returns200() throws Exception {
            mockMvc.perform(get("/products/1/reviews")
                            .param("page", "0")
                            .param("size", "5"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("200 - authenticated user can also view reviews")
        void getProductReviews_authenticated_returns200() throws Exception {
            mockMvc.perform(get("/products/1/reviews")
                            .header("Authorization", userToken))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("404 - product not found returns 404")
        void getProductReviews_productNotFound_returns404() throws Exception {
            mockMvc.perform(get("/products/99999/reviews"))
                    .andExpect(status().isNotFound());
        }
    }
}
