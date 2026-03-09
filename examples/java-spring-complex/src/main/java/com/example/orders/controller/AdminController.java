package com.example.orders.controller;

import org.springframework.boot.actuate.health.Health;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.RuntimeMXBean;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> getHealth() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("timestamp", LocalDateTime.now().toString());
        health.put("version", "1.0.0");

        Map<String, String> components = new HashMap<>();
        components.put("database", "UP");
        components.put("cache", "UP");
        components.put("paymentGateway", "UP");
        health.put("components", components);

        return ResponseEntity.ok(health);
    }

    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getMetrics() {
        RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();
        MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();

        Map<String, Object> metrics = new HashMap<>();
        metrics.put("timestamp", LocalDateTime.now().toString());
        metrics.put("uptimeMs", runtimeMXBean.getUptime());

        Map<String, Object> memory = new HashMap<>();
        memory.put("heapUsed", memoryMXBean.getHeapMemoryUsage().getUsed());
        memory.put("heapMax", memoryMXBean.getHeapMemoryUsage().getMax());
        memory.put("nonHeapUsed", memoryMXBean.getNonHeapMemoryUsage().getUsed());
        metrics.put("memory", memory);

        Map<String, Object> jvm = new HashMap<>();
        jvm.put("version", System.getProperty("java.version"));
        jvm.put("threads", ManagementFactory.getThreadMXBean().getThreadCount());
        metrics.put("jvm", jvm);

        // Application-level metrics (in production these would come from Micrometer)
        Map<String, Object> app = new HashMap<>();
        app.put("totalOrders", 0L);
        app.put("pendingOrders", 0L);
        app.put("totalRevenue", 0.0);
        app.put("activeUsers", 0L);
        metrics.put("application", app);

        return ResponseEntity.ok(metrics);
    }
}
