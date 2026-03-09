package com.example.healthcare.`tests-complete`

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.helpers.HealthcareApiClient
import com.example.healthcare.module
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested

@DisplayName("Admin API Tests (Complete Coverage)")
class AdminTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient { install(ContentNegotiation) { json() } }
        return HealthcareApiClient(httpClient)
    }

    @Nested
    @DisplayName("GET /admin/health - Health Check")
    inner class HealthCheck {

        @Test
        fun `should return UP status when system is healthy`() = testApplication {
            application { module() }
            val response = client.get("/admin/health")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("UP", body["status"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should include version and timestamp in health response`() = testApplication {
            application { module() }
            val response = client.get("/admin/health")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["version"])
            assertNotNull(body["timestamp"])
        }

        @Test
        fun `should include component health statuses`() = testApplication {
            application { module() }
            val response = client.get("/admin/health")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val components = body["components"]?.jsonObject
            assertNotNull(components)
            assertNotNull(components!!["database"])
            assertNotNull(components["authService"])
            assertNotNull(components["billingService"])
        }

        @Test
        fun `should respond to health check using ApiPaths constant`() = testApplication {
            application { module() }
            val response = client.get(ApiPaths.ADMIN_HEALTH)
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should use HealthcareApiClient to get health status`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getHealthStatus()
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("GET /admin/metrics - System Metrics")
    inner class SystemMetrics {

        @Test
        fun `should return metrics data`() = testApplication {
            application { module() }
            val response = client.get("/admin/metrics")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["uptime"])
            assertNotNull(body["totalRequests"])
            assertNotNull(body["memoryUsageMb"])
        }

        @Test
        fun `should report non-negative uptime`() = testApplication {
            application { module() }
            val response = client.get("/admin/metrics")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertTrue(body["uptime"]!!.jsonPrimitive.long >= 0)
        }

        @Test
        fun `should include patient and appointment counts`() = testApplication {
            application { module() }
            val response = client.get("/admin/metrics")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["totalPatients"])
            assertNotNull(body["totalAppointments"])
        }

        @Test
        fun `should use HealthcareApiClient to get metrics`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getMetrics()
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should respond to metrics check using ApiPaths constant`() = testApplication {
            application { module() }
            val response = client.get(ApiPaths.ADMIN_METRICS)
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("GET /admin/audit-log - Audit Log")
    inner class AuditLog {

        @Test
        fun `should return audit log entries`() = testApplication {
            application { module() }
            val response = client.get("/admin/audit-log")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["entries"])
            assertNotNull(body["totalCount"])
            assertNotNull(body["page"])
        }

        @Test
        fun `should support pagination`() = testApplication {
            application { module() }
            val response = client.get("/admin/audit-log?page=1&pageSize=10")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(1, body["page"]?.jsonPrimitive?.int)
            assertEquals(10, body["pageSize"]?.jsonPrimitive?.int)
            assertTrue(body["entries"]!!.jsonArray.size <= 10)
        }

        @Test
        fun `should use HealthcareApiClient to get audit log`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getAuditLog(page = 1, pageSize = 20)
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should respond to audit log check using ApiPaths constant`() = testApplication {
            application { module() }
            val response = client.get(ApiPaths.ADMIN_AUDIT_LOG)
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }
}
