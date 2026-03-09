package com.example.orders.service;

import com.example.orders.model.*;
import com.example.orders.repository.OrderRepository;
import com.example.orders.repository.ProductRepository;
import com.example.orders.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

@Service
@Transactional
public class OrderService {

    private static final BigDecimal MAX_ORDER_AMOUNT = new BigDecimal("10000.00");

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;

    public OrderService(OrderRepository orderRepository, UserRepository userRepository,
                        ProductRepository productRepository) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
    }

    public Order createOrder(Map<String, Object> orderRequest, String username, String idempotencyKey) {
        // Business rule: only-authenticated-users-can-place-orders (enforced via Spring Security)
        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Business rule: duplicate-order-prevention
        if (idempotencyKey != null && orderRepository.existsByIdempotencyKey(idempotencyKey)) {
            throw new IllegalStateException("Duplicate order: idempotency key already used");
        }

        Order order = new Order(user, idempotencyKey);
        if (orderRequest.containsKey("shippingAddress")) {
            order.setShippingAddress(orderRequest.get("shippingAddress").toString());
        }
        if (orderRequest.containsKey("notes")) {
            order.setNotes(orderRequest.get("notes").toString());
        }
        return orderRepository.save(order);
    }

    @Transactional(readOnly = true)
    public Page<Order> getOrdersForUser(String username, int page, int size, String status) {
        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        PageRequest pageRequest = PageRequest.of(page, size);
        if (status != null && !status.isBlank()) {
            Order.OrderStatus orderStatus = Order.OrderStatus.valueOf(status.toUpperCase());
            return orderRepository.findByUserAndStatus(user, orderStatus, pageRequest);
        }
        return orderRepository.findByUser(user, pageRequest);
    }

    @Transactional(readOnly = true)
    public Optional<Order> findByIdAndUser(Long id, String username) {
        return orderRepository.findById(id).filter(order ->
                order.getUser().getEmail().equals(username));
    }

    @Transactional(readOnly = true)
    public Optional<Shipment> findShipmentByIdAndUser(Long shipmentId, String username) {
        return orderRepository.findShipmentById(shipmentId)
                .filter(s -> s.getOrder().getUser().getEmail().equals(username));
    }

    public Order updateOrderStatus(Long id, String newStatus, UserDetails currentUser) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));

        boolean isAdmin = currentUser.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
        if (!isAdmin && !order.getUser().getEmail().equals(currentUser.getUsername())) {
            throw new IllegalArgumentException("Access denied");
        }

        try {
            Order.OrderStatus status = Order.OrderStatus.valueOf(newStatus.toUpperCase());
            order.setStatus(status);
            return orderRepository.save(order);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid order status: " + newStatus);
        }
    }

    public void cancelOrder(Long id, String username) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));

        if (!order.getUser().getEmail().equals(username)) {
            throw new IllegalArgumentException("Access denied");
        }
        if (order.getStatus() == Order.OrderStatus.SHIPPED ||
            order.getStatus() == Order.OrderStatus.DELIVERED) {
            throw new IllegalStateException("Cannot cancel order in status: " + order.getStatus());
        }
        order.setStatus(Order.OrderStatus.CANCELLED);
        orderRepository.save(order);
    }

    public OrderItem addItemToOrder(Long orderId, Map<String, Object> itemRequest, String username) {
        Order order = findByIdAndUser(orderId, username)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));

        if (order.getStatus() != Order.OrderStatus.PENDING) {
            throw new IllegalStateException("Cannot add items to order in status: " + order.getStatus());
        }

        Long productId = Long.valueOf(itemRequest.get("productId").toString());
        int quantity = Integer.parseInt(itemRequest.get("quantity").toString());

        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new IllegalArgumentException("Product not found"));

        // Business rule: inventory-check-before-order
        if (product.getStockQuantity() < quantity) {
            throw new IllegalStateException("Insufficient stock. Available: " + product.getStockQuantity());
        }

        OrderItem item = new OrderItem(order, product, quantity, product.getPrice());
        order.getItems().add(item);

        BigDecimal newTotal = order.getItems().stream()
                .map(OrderItem::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Business rule: max-order-amount-10000
        if (newTotal.compareTo(MAX_ORDER_AMOUNT) > 0) {
            throw new IllegalStateException("Order exceeds maximum allowed amount of $10,000");
        }

        order.setTotalAmount(newTotal);
        orderRepository.save(order);

        // Reduce stock
        product.setStockQuantity(product.getStockQuantity() - quantity);
        productRepository.save(product);

        return item;
    }

    public void removeItemFromOrder(Long orderId, Long itemId, String username) {
        Order order = findByIdAndUser(orderId, username)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));

        if (order.getStatus() != Order.OrderStatus.PENDING) {
            throw new IllegalStateException("Cannot remove items from order in status: " + order.getStatus());
        }

        OrderItem item = order.getItems().stream()
                .filter(i -> i.getId().equals(itemId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Order item not found"));

        // Restore stock
        Product product = item.getProduct();
        product.setStockQuantity(product.getStockQuantity() + item.getQuantity());
        productRepository.save(product);

        order.getItems().remove(item);
        BigDecimal newTotal = order.getItems().stream()
                .map(OrderItem::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setTotalAmount(newTotal);
        orderRepository.save(order);
    }

    public Shipment updateShipmentStatus(Long shipmentId, String status, String trackingNumber, String carrier) {
        Shipment shipment = orderRepository.findShipmentById(shipmentId)
                .orElseThrow(() -> new IllegalArgumentException("Shipment not found"));

        // Business rule: payment-required-before-shipment
        Order order = shipment.getOrder();
        if (status != null && status.equalsIgnoreCase("SHIPPED")) {
            Payment payment = order.getPayment();
            if (payment == null || payment.getStatus() != Payment.PaymentStatus.CAPTURED) {
                throw new IllegalStateException("Payment must be captured before shipping");
            }
        }

        try {
            Shipment.ShipmentStatus shipmentStatus = Shipment.ShipmentStatus.valueOf(status.toUpperCase());
            shipment.setStatus(shipmentStatus);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid shipment status: " + status);
        }

        if (trackingNumber != null) shipment.setTrackingNumber(trackingNumber);
        if (carrier != null) shipment.setCarrier(carrier);

        return orderRepository.saveShipment(shipment);
    }
}
