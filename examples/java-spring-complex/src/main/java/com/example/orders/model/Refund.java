package com.example.orders.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "refunds")
public class Refund {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payment_id", nullable = false)
    private Payment payment;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RefundStatus status = RefundStatus.PENDING;

    @NotNull
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column
    private String reason;

    @Column
    private String gatewayRefundId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public enum RefundStatus {
        PENDING, PROCESSING, COMPLETED, FAILED, REJECTED
    }

    // Constructors
    public Refund() {}

    public Refund(Payment payment, BigDecimal amount, String reason) {
        this.payment = payment;
        this.amount = amount;
        this.reason = reason;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Payment getPayment() { return payment; }
    public void setPayment(Payment payment) { this.payment = payment; }

    public RefundStatus getStatus() { return status; }
    public void setStatus(RefundStatus status) { this.status = status; }

    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public String getGatewayRefundId() { return gatewayRefundId; }
    public void setGatewayRefundId(String gatewayRefundId) { this.gatewayRefundId = gatewayRefundId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
