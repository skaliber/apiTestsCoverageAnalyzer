package com.example.orders.repository;

import com.example.orders.model.Order;
import com.example.orders.model.Payment;
import com.example.orders.model.Refund;
import com.example.orders.model.Shipment;
import com.example.orders.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Page<Order> findByUser(User user, Pageable pageable);

    Page<Order> findByUserAndStatus(User user, Order.OrderStatus status, Pageable pageable);

    boolean existsByIdempotencyKey(String idempotencyKey);

    @Query("SELECT p FROM Payment p WHERE p.id = :id")
    Optional<Payment> findPaymentById(@Param("id") Long id);

    @Query("SELECT r FROM Refund r WHERE r.id = :id")
    Optional<Refund> findRefundById(@Param("id") Long id);

    @Query("SELECT s FROM Shipment s WHERE s.id = :id")
    Optional<Shipment> findShipmentById(@Param("id") Long id);

    default Payment savePayment(Payment payment) {
        // Delegates to JPA in a real EntityManager; stub for interface completeness
        throw new UnsupportedOperationException("savePayment not implemented at repository level");
    }

    default Refund saveRefund(Refund refund) {
        throw new UnsupportedOperationException("saveRefund not implemented at repository level");
    }

    default Shipment saveShipment(Shipment shipment) {
        throw new UnsupportedOperationException("saveShipment not implemented at repository level");
    }
}
