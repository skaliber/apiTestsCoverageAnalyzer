package com.example.orders.controller;

import com.example.orders.model.Order;
import com.example.orders.model.OrderItem;
import com.example.orders.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> createOrder(
            @Valid @RequestBody Map<String, Object> orderRequest,
            @AuthenticationPrincipal UserDetails currentUser,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        try {
            Order order = orderService.createOrder(orderRequest, currentUser.getUsername(), idempotencyKey);
            return ResponseEntity.status(HttpStatus.CREATED).body(order);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Page<Order>> getOrders(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal UserDetails currentUser) {
        Page<Order> orders = orderService.getOrdersForUser(currentUser.getUsername(), page, size, status);
        return ResponseEntity.ok(orders);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Order> getOrderById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        return orderService.findByIdAndUser(id, currentUser.getUsername())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN') or isAuthenticated()")
    public ResponseEntity<?> updateOrderStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> statusRequest,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            Order updated = orderService.updateOrderStatus(id, statusRequest.get("status"), currentUser);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> cancelOrder(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            orderService.cancelOrder(id, currentUser.getUsername());
            return ResponseEntity.ok(Map.of("message", "Order cancelled successfully"));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{id}/items")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> addOrderItem(
            @PathVariable Long id,
            @Valid @RequestBody Map<String, Object> itemRequest,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            OrderItem item = orderService.addItemToOrder(id, itemRequest, currentUser.getUsername());
            return ResponseEntity.status(HttpStatus.CREATED).body(item);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}/items/{itemId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> removeOrderItem(
            @PathVariable Long id,
            @PathVariable Long itemId,
            @AuthenticationPrincipal UserDetails currentUser) {
        try {
            orderService.removeItemFromOrder(id, itemId, currentUser.getUsername());
            return ResponseEntity.ok(Map.of("message", "Item removed from order"));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("error", e.getMessage()));
        }
    }
}
