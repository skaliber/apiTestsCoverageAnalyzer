package com.example.orders.service;

import com.example.orders.model.Payment;
import com.example.orders.model.Refund;
import com.example.orders.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
public class RefundService {

    private static final int REFUND_WINDOW_DAYS = 30;

    private final OrderRepository orderRepository;

    public RefundService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public Refund createRefund(Map<String, Object> refundRequest, String username) {
        Long paymentId = Long.valueOf(refundRequest.get("paymentId").toString());
        BigDecimal amount = new BigDecimal(refundRequest.get("amount").toString());
        String reason = refundRequest.getOrDefault("reason", "Customer request").toString();

        Payment payment = orderRepository.findPaymentById(paymentId)
                .orElseThrow(() -> new IllegalArgumentException("Payment not found"));

        if (!payment.getOrder().getUser().getEmail().equals(username)) {
            throw new IllegalArgumentException("Access denied");
        }
        if (payment.getStatus() != Payment.PaymentStatus.CAPTURED) {
            throw new IllegalStateException("Only captured payments can be refunded");
        }

        // Business rule: refund-window-30-days
        if (payment.getCapturedAt() != null) {
            long daysSinceCapture = ChronoUnit.DAYS.between(payment.getCapturedAt(), LocalDateTime.now());
            if (daysSinceCapture > REFUND_WINDOW_DAYS) {
                throw new IllegalStateException(
                        "Refund window has expired. Refunds must be requested within " + REFUND_WINDOW_DAYS + " days");
            }
        }

        if (amount.compareTo(payment.getAmount()) > 0) {
            throw new IllegalArgumentException("Refund amount cannot exceed payment amount");
        }

        Refund refund = new Refund(payment, amount, reason);
        refund.setStatus(Refund.RefundStatus.PROCESSING);
        refund.setGatewayRefundId("REF-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());

        return orderRepository.saveRefund(refund);
    }

    @Transactional(readOnly = true)
    public Optional<Refund> findByIdAndUser(Long id, String username) {
        return orderRepository.findRefundById(id)
                .filter(r -> r.getPayment().getOrder().getUser().getEmail().equals(username));
    }
}
