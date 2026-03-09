package com.example.orders.controller;

import com.example.orders.model.Product;
import com.example.orders.service.InventoryService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/products")
public class ProductController {

    private final InventoryService inventoryService;

    public ProductController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping
    public ResponseEntity<Page<Product>> getProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {
        Sort sort = sortDir.equalsIgnoreCase("asc")
                ? Sort.by(sortBy).ascending()
                : Sort.by(sortBy).descending();
        PageRequest pageRequest = PageRequest.of(page, size, sort);
        Page<Product> products = inventoryService.searchProducts(pageRequest, category, search, minPrice, maxPrice);
        return ResponseEntity.ok(products);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Product> createProduct(@Valid @RequestBody Product product) {
        Product created = inventoryService.createProduct(product);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getProductById(@PathVariable Long id) {
        return inventoryService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Product> updateProduct(@PathVariable Long id, @Valid @RequestBody Product productDetails) {
        return inventoryService.updateProduct(id, productDetails)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, String>> deleteProduct(@PathVariable Long id) {
        boolean deleted = inventoryService.deleteProduct(id);
        if (deleted) {
            return ResponseEntity.ok(Map.of("message", "Product deleted successfully"));
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/{id}/reviews")
    public ResponseEntity<?> getProductReviews(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return inventoryService.findById(id)
                .map(p -> ResponseEntity.ok(inventoryService.getReviewsForProduct(id, page, size)))
                .orElse(ResponseEntity.notFound().build());
    }
}
