package com.example.orders.controller;

import com.example.orders.model.Refund;
import com.example.orders.service.RefundService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/refunds")
public class RefundController {

    private final RefundService refundService;

    public RefundController(RefundService refundService) {
        this.refundService = refundService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> createRefund(
            @Valid @RequestBody Map<String, Object> refundRequest,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            Refund refund = refundService.createRefund(refundRequest, currentUser.getUsername());
            return ResponseEntity.status(HttpStatus.CREATED).body(refund);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Refund> getRefundById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        return refundService.findByIdAndUser(id, currentUser.getUsername())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
