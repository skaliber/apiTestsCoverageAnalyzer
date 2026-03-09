package com.example.orders.service;

import com.example.orders.model.Product;
import com.example.orders.repository.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

@Service
@Transactional
public class InventoryService {

    private final ProductRepository productRepository;

    public InventoryService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    public Product createProduct(Product product) {
        if (productRepository.existsBySku(product.getSku())) {
            throw new IllegalArgumentException("Product with SKU already exists: " + product.getSku());
        }
        return productRepository.save(product);
    }

    @Transactional(readOnly = true)
    public Optional<Product> findById(Long id) {
        return productRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public Page<Product> searchProducts(PageRequest pageRequest, String category,
                                         String search, BigDecimal minPrice, BigDecimal maxPrice) {
        return productRepository.findWithFilters(pageRequest, category, search, minPrice, maxPrice);
    }

    public Optional<Product> updateProduct(Long id, Product details) {
        return productRepository.findById(id).map(existing -> {
            if (details.getName() != null) existing.setName(details.getName());
            if (details.getDescription() != null) existing.setDescription(details.getDescription());
            if (details.getPrice() != null) existing.setPrice(details.getPrice());
            if (details.getStockQuantity() != null) existing.setStockQuantity(details.getStockQuantity());
            if (details.getCategory() != null) existing.setCategory(details.getCategory());
            return productRepository.save(existing);
        });
    }

    public boolean deleteProduct(Long id) {
        return productRepository.findById(id).map(product -> {
            product.setActive(false);
            productRepository.save(product);
            return true;
        }).orElse(false);
    }

    public boolean checkAndReserveStock(Long productId, int quantity) {
        return productRepository.findById(productId).map(product -> {
            if (product.getStockQuantity() >= quantity) {
                product.setStockQuantity(product.getStockQuantity() - quantity);
                productRepository.save(product);
                return true;
            }
            return false;
        }).orElse(false);
    }

    public Object getReviewsForProduct(Long productId, int page, int size) {
        // In a full implementation this would query a reviews table
        return Map.of(
                "content", java.util.List.of(),
                "totalElements", 0,
                "totalPages", 0,
                "size", size,
                "number", page
        );
    }
}
