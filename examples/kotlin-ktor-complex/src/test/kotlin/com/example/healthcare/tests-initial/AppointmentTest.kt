package com.example.healthcare.`tests-initial`

import com.example.healthcare.module
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.DisplayName
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Initial appointment tests - partial coverage
 * Covers basic booking and retrieval but is missing:
 * - Business rule validations (24h advance booking, duplicates)
 * - Check-in and complete flows
 * - Cancellation with fee scenarios
 * - Error paths
 */
@DisplayName("Appointment API Tests (Initial - Partial Coverage)")
class AppointmentTest {

    private fun futureDateTime(hoursFromNow: Long = 48): String {
        return Instant.now().plus(hoursFromNow, ChronoUnit.HOURS).toString()
    }

    @Test
    @DisplayName("GET /appointments should return all appointments")
    fun `test get all appointments`() = testApplication {
        application { module() }
        val response = client.get("/appointments")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertNotNull(body["items"])
        assertTrue(body["items"]!!.jsonArray.isNotEmpty())
    }

    @Test
    @DisplayName("GET /appointments/{id} should return specific appointment")
    fun `test get appointment by id`() = testApplication {
        application { module() }
        val response = client.get("/appointments/appt-002")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("appt-002", body["id"]?.jsonPrimitive?.content)
    }

    @Test
    @DisplayName("POST /appointments should create a new appointment")
    fun `test book appointment success`() = testApplication {
        application { module() }
        val futureTime = futureDateTime(48)
        val response = client.post("/appointments") {
            contentType(ContentType.Application.Json)
            setBody("""
                {
                    "patientId": "patient-003",
                    "doctorId": "doctor-001",
                    "scheduledAt": "$futureTime",
                    "duration": 30,
                    "type": "ROUTINE_CHECKUP",
                    "reasonForVisit": "New patient consultation"
                }
            """.trimIndent())
        }
        assertEquals(HttpStatusCode.Created, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("patient-003", body["patientId"]?.jsonPrimitive?.content)
        assertEquals("SCHEDULED", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    @DisplayName("GET /appointments filtered by patientId should return patient's appointments")
    fun `test get appointments by patient`() = testApplication {
        application { module() }
        val response = client.get("/appointments?patientId=patient-001")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val items = body["items"]!!.jsonArray
        assertTrue(items.all { it.jsonObject["patientId"]?.jsonPrimitive?.content == "patient-001" })
    }

    @Test
    @DisplayName("GET /appointments filtered by status should return matching appointments")
    fun `test get appointments by status`() = testApplication {
        application { module() }
        val response = client.get("/appointments?status=SCHEDULED")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val items = body["items"]!!.jsonArray
        assertTrue(items.all { it.jsonObject["status"]?.jsonPrimitive?.content == "SCHEDULED" })
    }

    // NOTE: Missing tests for:
    // - POST /appointments within 24h (400 - business rule violation)
    // - POST /appointments with overlapping times (409 - duplicate prevention)
    // - POST /appointments with unavailable doctor (409)
    // - POST /appointments with non-existent patient (404)
    // - DELETE /appointments/{id} within 24h (should incur cancellation fee)
    // - POST /appointments/{id}/check-in happy path
    // - POST /appointments/{id}/check-in with wrong status (400)
    // - POST /appointments/{id}/complete happy path
    // - POST /appointments/{id}/complete without diagnosis (400)
    // - GET /appointments/{id} with non-existent ID (404)
}
