package com.example.orders.controller;

import com.example.orders.model.Payment;
import com.example.orders.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> initiatePayment(
            @Valid @RequestBody Map<String, Object> paymentRequest,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            Payment payment = paymentService.initiatePayment(paymentRequest, currentUser.getUsername());
            return ResponseEntity.status(HttpStatus.CREATED).body(payment);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Payment> getPaymentById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        return paymentService.findByIdAndUser(id, currentUser.getUsername())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/capture")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> capturePayment(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            Payment captured = paymentService.capturePayment(id, currentUser.getUsername());
            return ResponseEntity.ok(captured);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> voidPayment(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, String> voidRequest,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            Payment voided = paymentService.voidPayment(id, currentUser.getUsername());
            return ResponseEntity.ok(voided);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }
}
