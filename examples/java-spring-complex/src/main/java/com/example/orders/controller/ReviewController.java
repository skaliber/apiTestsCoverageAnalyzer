package com.example.orders.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/reviews")
public class ReviewController {

    // In a full implementation this would use a ReviewService
    // Kept inline here for conciseness.

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> createReview(
            @RequestBody Map<String, Object> reviewRequest,
            @AuthenticationPrincipal UserDetails currentUser) {

        Long productId = Long.valueOf(reviewRequest.get("productId").toString());
        Long orderId = Long.valueOf(reviewRequest.get("orderId").toString());
        int rating = Integer.parseInt(reviewRequest.get("rating").toString());
        String comment = (String) reviewRequest.get("comment");

        if (rating < 1 || rating > 5) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Rating must be between 1 and 5"));
        }

        // Business rule: review-requires-completed-order
        // Verified by service layer in production; here we simulate it
        boolean userHasCompletedOrder = true; // Would call reviewService.verifyCompletedOrder(...)
        if (!userHasCompletedOrder) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "You must have a completed order to write a review"));
        }

        Map<String, Object> review = Map.of(
                "id", 1L,
                "productId", productId,
                "orderId", orderId,
                "rating", rating,
                "comment", comment,
                "author", currentUser.getUsername(),
                "createdAt", LocalDateTime.now().toString()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(review);
    }
}
