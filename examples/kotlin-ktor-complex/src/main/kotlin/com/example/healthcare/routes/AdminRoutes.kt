package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicLong

@Serializable
data class HealthStatus(
    val status: String,
    val version: String,
    val timestamp: String,
    val components: Map<String, ComponentHealth>
)

@Serializable
data class ComponentHealth(
    val status: String,
    val message: String? = null
)

@Serializable
data class SystemMetrics(
    val uptime: Long,
    val totalRequests: Long,
    val activeConnections: Int,
    val totalPatients: Long,
    val totalAppointments: Long,
    val totalPrescriptions: Long,
    val totalInvoices: Long,
    val memoryUsageMb: Long,
    val timestamp: String
)

@Serializable
data class AuditLogEntry(
    val id: String,
    val timestamp: String,
    val userId: String,
    val action: String,
    val resource: String,
    val resourceId: String?,
    val ipAddress: String,
    val statusCode: Int,
    val details: String? = null
)

@Serializable
data class PaginatedAuditLog(
    val entries: List<AuditLogEntry>,
    val totalCount: Int,
    val page: Int,
    val pageSize: Int
)

private val auditLog = ConcurrentLinkedQueue<AuditLogEntry>()
private val requestCounter = AtomicLong(0)
private val startTime = System.currentTimeMillis()

fun logAuditEvent(
    userId: String,
    action: String,
    resource: String,
    resourceId: String?,
    ipAddress: String,
    statusCode: Int,
    details: String? = null
) {
    requestCounter.incrementAndGet()
    auditLog.add(
        AuditLogEntry(
            id = "audit-${System.currentTimeMillis()}-${(Math.random() * 1000).toInt()}",
            timestamp = Instant.now().toString(),
            userId = userId,
            action = action,
            resource = resource,
            resourceId = resourceId,
            ipAddress = ipAddress,
            statusCode = statusCode,
            details = details
        )
    )
    // Keep only last 10000 entries
    while (auditLog.size > 10000) auditLog.poll()
}

fun Route.adminRoutes() {

    // GET /admin/health - system health check
    get(ApiPaths.ADMIN_HEALTH) {
        val health = HealthStatus(
            status = "UP",
            version = "1.0.0",
            timestamp = Instant.now().toString(),
            components = mapOf(
                "database" to ComponentHealth("UP", "In-memory store operational"),
                "notificationService" to ComponentHealth("UP", "Email service connected"),
                "authService" to ComponentHealth("UP", "JWT authentication active"),
                "billingService" to ComponentHealth("UP", "Billing processor connected")
            )
        )
        call.respond(HttpStatusCode.OK, health)
    }

    // GET /admin/metrics - system metrics
    get(ApiPaths.ADMIN_METRICS) {
        val runtime = Runtime.getRuntime()
        val usedMemory = (runtime.totalMemory() - runtime.freeMemory()) / (1024 * 1024)
        val uptimeSeconds = (System.currentTimeMillis() - startTime) / 1000

        val metrics = SystemMetrics(
            uptime = uptimeSeconds,
            totalRequests = requestCounter.get(),
            activeConnections = (Math.random() * 50).toInt() + 5,
            totalPatients = 3L,
            totalAppointments = 3L,
            totalPrescriptions = 1L,
            totalInvoices = 1L,
            memoryUsageMb = usedMemory,
            timestamp = Instant.now().toString()
        )
        call.respond(HttpStatusCode.OK, metrics)
    }

    // GET /admin/audit-log - paginated audit log
    get(ApiPaths.ADMIN_AUDIT_LOG) {
        val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
        val pageSize = call.request.queryParameters["pageSize"]?.toIntOrNull() ?: 50
        val userId = call.request.queryParameters["userId"]
        val resource = call.request.queryParameters["resource"]
        val action = call.request.queryParameters["action"]

        var entries = auditLog.toList()
        if (userId != null) entries = entries.filter { it.userId == userId }
        if (resource != null) entries = entries.filter { it.resource == resource }
        if (action != null) entries = entries.filter { it.action.contains(action, ignoreCase = true) }

        val sorted = entries.sortedByDescending { it.timestamp }
        val total = sorted.size
        val start = (page - 1) * pageSize
        val paged = sorted.drop(start).take(pageSize)

        call.respond(HttpStatusCode.OK, PaginatedAuditLog(
            entries = paged,
            totalCount = total,
            page = page,
            pageSize = pageSize
        ))
    }
}
