package com.example.orders.service;

import com.example.orders.model.Order;
import com.example.orders.model.Payment;
import com.example.orders.repository.OrderRepository;
import com.example.orders.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class PaymentService {

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public PaymentService(OrderRepository orderRepository, UserRepository userRepository) {
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    public Payment initiatePayment(Map<String, Object> paymentRequest, String username) {
        Long orderId = Long.valueOf(paymentRequest.get("orderId").toString());
        String paymentMethod = paymentRequest.get("paymentMethod").toString();

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("Order not found"));

        if (!order.getUser().getEmail().equals(username)) {
            throw new IllegalArgumentException("Access denied");
        }
        if (order.getStatus() == Order.OrderStatus.CANCELLED) {
            throw new IllegalStateException("Cannot pay for a cancelled order");
        }
        if (order.getPayment() != null) {
            throw new IllegalStateException("Order already has a payment");
        }

        BigDecimal amount = order.getTotalAmount();
        Payment payment = new Payment(order, amount, paymentMethod);
        payment.setTransactionId(UUID.randomUUID().toString());
        payment.setStatus(Payment.PaymentStatus.AUTHORIZED);

        order.setPayment(payment);
        order.setStatus(Order.OrderStatus.CONFIRMED);
        orderRepository.save(order);

        return payment;
    }

    @Transactional(readOnly = true)
    public Optional<Payment> findByIdAndUser(Long id, String username) {
        return orderRepository.findPaymentById(id)
                .filter(p -> p.getOrder().getUser().getEmail().equals(username));
    }

    public Payment capturePayment(Long id, String username) {
        Payment payment = orderRepository.findPaymentById(id)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found"));

        if (!payment.getOrder().getUser().getEmail().equals(username)) {
            throw new IllegalArgumentException("Access denied");
        }
        if (payment.getStatus() != Payment.PaymentStatus.AUTHORIZED) {
            throw new IllegalStateException("Only AUTHORIZED payments can be captured");
        }

        payment.setStatus(Payment.PaymentStatus.CAPTURED);
        payment.setCapturedAt(LocalDateTime.now());
        payment.setGatewayReference("GW-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        orderRepository.savePayment(payment);

        Order order = payment.getOrder();
        order.setStatus(Order.OrderStatus.PROCESSING);
        orderRepository.save(order);

        return payment;
    }

    public Payment voidPayment(Long id, String username) {
        Payment payment = orderRepository.findPaymentById(id)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found"));

        if (!payment.getOrder().getUser().getEmail().equals(username)) {
            throw new IllegalArgumentException("Access denied");
        }
        if (payment.getStatus() == Payment.PaymentStatus.CAPTURED) {
            throw new IllegalStateException("Captured payments cannot be voided; use refund instead");
        }
        if (payment.getStatus() != Payment.PaymentStatus.AUTHORIZED &&
                payment.getStatus() != Payment.PaymentStatus.PENDING) {
            throw new IllegalStateException("Payment cannot be voided in status: " + payment.getStatus());
        }

        payment.setStatus(Payment.PaymentStatus.VOIDED);
        return orderRepository.savePayment(payment);
    }
}
