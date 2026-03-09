package com.example.orders.controller;

import com.example.orders.model.Shipment;
import com.example.orders.service.OrderService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/shipments")
public class ShipmentController {

    private final OrderService orderService;

    public ShipmentController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Shipment> getShipmentById(
            @PathVariable Long id,
            @AuthenticationPrincipal UserDetails currentUser) {
        return orderService.findShipmentByIdAndUser(id, currentUser.getUsername())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateShipmentStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> statusRequest) {
        try {
            Shipment updated = orderService.updateShipmentStatus(id, statusRequest.get("status"),
                    statusRequest.get("trackingNumber"), statusRequest.get("carrier"));
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(422).body(Map.of("error", e.getMessage()));
        }
    }
}
