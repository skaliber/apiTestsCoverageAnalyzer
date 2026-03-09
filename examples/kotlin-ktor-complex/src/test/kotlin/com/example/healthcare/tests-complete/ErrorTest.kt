package com.example.healthcare.`tests-complete`

import com.example.healthcare.module
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested

/**
 * Error handling tests covering:
 * - 400 Bad Request paths for all major endpoints
 * - 404 Not Found for non-existent resources
 * - 409 Conflict for duplicate resources
 * - 410 Gone for expired resources
 * - Invalid JSON payloads
 * - Missing required fields
 */
@DisplayName("Error Handling Tests")
class ErrorTest {

    @Nested
    @DisplayName("400 Bad Request Scenarios")
    inner class BadRequestScenarios {

        @Test
        fun `should return 400 for invalid patient pagination parameters`() = testApplication {
            application { module() }
            val response = client.get("/patients?page=-1")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for patient registration with blank name`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "  ",
                        "dateOfBirth": "1990-01-01",
                        "email": "test@example.com",
                        "phone": "555-1234",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for appointment with invalid duration`() = testApplication {
            application { module() }
            val response = client.post("/appointments") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-001",
                        "scheduledAt": "2027-05-01T10:00:00Z",
                        "duration": 999,
                        "type": "IN_PERSON",
                        "reasonForVisit": "Test"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for prescription with empty medication list`() = testApplication {
            application { module() }
            val response = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-001",
                        "medications": [],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for invoice with no line items`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody("""{"patientId": "patient-001", "lineItems": [], "dueDate": "2026-04-01T00:00:00Z"}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for doctor availability with invalid date`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-001/availability?date=not-a-date")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for malformed JSON body`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("{ this is not: valid json }")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for check-in of already completed appointment`() = testApplication {
            application { module() }
            val response = client.post("/appointments/appt-001/check-in") {
                contentType(ContentType.Application.Json)
                setBody("""{"arrivalTime": "2025-02-15T10:00:00Z"}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for completing appointment without diagnosis`() = testApplication {
            application { module() }
            val response = client.post("/appointments/appt-002/complete") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "diagnosis": "",
                        "treatmentPlan": "Rest",
                        "followUpRequired": false
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }
    }

    @Nested
    @DisplayName("404 Not Found Scenarios")
    inner class NotFoundScenarios {

        @Test
        fun `should return 404 for non-existent patient`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-xyz-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("NOT_FOUND", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 404 for non-existent appointment`() = testApplication {
            application { module() }
            val response = client.get("/appointments/appt-xyz-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 for non-existent doctor`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-xyz-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 for non-existent prescription`() = testApplication {
            application { module() }
            val response = client.get("/prescriptions/rx-xyz-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 for non-existent invoice`() = testApplication {
            application { module() }
            val response = client.get("/billing/invoices/inv-xyz-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 when updating non-existent patient`() = testApplication {
            application { module() }
            val response = client.put("/patients/patient-nonexistent") {
                contentType(ContentType.Application.Json)
                setBody("""{"phone": "555-1234"}""")
            }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 when deleting non-existent patient`() = testApplication {
            application { module() }
            val response = client.delete("/patients/patient-nonexistent")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 404 for non-existent doctor availability`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-nonexistent/availability")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }
    }

    @Nested
    @DisplayName("409 Conflict Scenarios")
    inner class ConflictScenarios {

        @Test
        fun `should return 409 when creating patient with duplicate email`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "Duplicate",
                        "dateOfBirth": "1990-01-01",
                        "email": "alice.johnson@email.com",
                        "phone": "555-9999",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }

        @Test
        fun `should return 409 for overlapping patient appointments`() = testApplication {
            application { module() }
            // Book first appointment
            val time = "2027-06-15T10:00:00Z"
            client.post("/appointments") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-003",
                        "doctorId": "doctor-001",
                        "scheduledAt": "$time",
                        "duration": 60,
                        "type": "IN_PERSON",
                        "reasonForVisit": "First appointment"
                    }
                """.trimIndent())
            }

            // Book second appointment at the same time
            val response = client.post("/appointments") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-003",
                        "doctorId": "doctor-002",
                        "scheduledAt": "$time",
                        "duration": 30,
                        "type": "IN_PERSON",
                        "reasonForVisit": "Second appointment - should conflict"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }

        @Test
        fun `should return 409 for doctor double booking`() = testApplication {
            application { module() }
            val time = "2027-07-20T14:00:00Z"

            // Book doctor for patient-001
            client.post("/appointments") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-004",
                        "scheduledAt": "$time",
                        "duration": 45,
                        "type": "SPECIALIST_REFERRAL",
                        "reasonForVisit": "Cardiac consult"
                    }
                """.trimIndent())
            }

            // Try to book same doctor at same time for patient-002
            val response = client.post("/appointments") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-002",
                        "doctorId": "doctor-004",
                        "scheduledAt": "$time",
                        "duration": 30,
                        "type": "IN_PERSON",
                        "reasonForVisit": "Doctor conflict test"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }

        @Test
        fun `should return 409 for already-fulfilled prescription fulfillment`() = testApplication {
            application { module() }
            // Fulfill rx-001
            client.put("/prescriptions/rx-001/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-03-01T10:00:00Z"}""")
            }
            // Try again
            val response = client.put("/prescriptions/rx-001/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-002", "fulfilledAt": "2025-03-02T10:00:00Z"}""")
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }
    }

    @Nested
    @DisplayName("Error Response Format")
    inner class ErrorResponseFormat {

        @Test
        fun `error responses should include code and message fields`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-nonexistent")
            assertEquals(HttpStatusCode.NotFound, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["code"], "Error response must include 'code' field")
            assertNotNull(body["message"], "Error response must include 'message' field")
        }

        @Test
        fun `validation error should have VALIDATION_ERROR code`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "",
                        "dateOfBirth": "1990-01-01",
                        "email": "test@example.com",
                        "phone": "555-1234",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("VALIDATION_ERROR", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `not found error should have NOT_FOUND code`() = testApplication {
            application { module() }
            val response = client.get("/appointments/appt-definitely-not-here")
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("NOT_FOUND", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `conflict error should have CONFLICT code`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "Another Alice",
                        "dateOfBirth": "1990-01-01",
                        "email": "alice.johnson@email.com",
                        "phone": "555-XXXX",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("CONFLICT", body["code"]?.jsonPrimitive?.content)
        }
    }
}
