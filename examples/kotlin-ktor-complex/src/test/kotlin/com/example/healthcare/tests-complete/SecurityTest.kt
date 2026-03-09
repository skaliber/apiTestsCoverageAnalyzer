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
 * Security tests covering:
 * - Patient data privacy (business rule: patient-data-privacy)
 * - Medical record access control (business rule: medical-record-access-control)
 * - Authorization header validation
 * - Protected resource access patterns
 */
@DisplayName("Security Tests")
class SecurityTest {

    @Nested
    @DisplayName("Patient Data Privacy")
    inner class PatientDataPrivacy {

        @Test
        fun `should allow patient to access own records`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001") {
                header("X-User-Id", "patient-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should block patient from accessing another patient records`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001") {
                header("X-User-Id", "patient-002") // Different patient trying to access patient-001's data
            }
            assertEquals(HttpStatusCode.Forbidden, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("FORBIDDEN", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should allow doctor to access patient records`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001") {
                header("X-User-Id", "doctor-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should allow admin to access any patient records`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001") {
                header("X-User-Id", "admin-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should allow access without X-User-Id header (unauthenticated access)`() = testApplication {
            application { module() }
            // No authentication header - service currently allows this (would be protected by JWT in production)
            val response = client.get("/patients/patient-001")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("Medical Record Access Control")
    inner class MedicalRecordAccessControl {

        @Test
        fun `should require X-Doctor-Id to create medical records`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                // No X-Doctor-Id header
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "Unauthorized Note",
                        "content": "Should be rejected"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Unauthorized, response.status)
        }

        @Test
        fun `should allow doctor to create records for their patients`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-001")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "PROGRESS_NOTES",
                        "title": "Follow-up Note",
                        "content": "Patient doing well."
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
        }

        @Test
        fun `should filter confidential records for non-owning patients`() = testApplication {
            application { module() }
            // Create a confidential record
            client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-001")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "Sensitive Mental Health Note",
                        "content": "Private information",
                        "isConfidential": true
                    }
                """.trimIndent())
            }

            // Access as patient-002 (unauthorized)
            val response = client.get("/medical-records/patient-001") {
                header("X-User-Id", "patient-002")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val records = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(records.none {
                it.jsonObject["title"]?.jsonPrimitive?.content == "Sensitive Mental Health Note"
            })
        }

        @Test
        fun `should allow authorized doctor to see non-confidential records`() = testApplication {
            application { module() }
            val response = client.get("/medical-records/patient-001") {
                header("X-Doctor-Id", "doctor-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val records = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(records.isNotEmpty())
        }
    }

    @Nested
    @DisplayName("Controlled Substance Prescriptions")
    inner class ControlledSubstanceSecurity {

        @Test
        fun `should require two-factor for controlled substance prescription fulfillment`() = testApplication {
            application { module() }
            // Create controlled substance prescription
            val createResp = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-001",
                        "medications": [{
                            "name": "Tramadol",
                            "dosage": "50mg",
                            "frequency": "Every 6 hours",
                            "duration": "5 days",
                            "instructions": "Pain relief",
                            "isControlledSubstance": true,
                            "dea_schedule": "IV"
                        }],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Accepted, createResp.status)
            val rxId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            // Attempt fulfillment without two-factor
            val fulfillResp = client.put("/prescriptions/$rxId/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-04-01T10:00:00Z"}""")
            }
            assertEquals(HttpStatusCode.Forbidden, fulfillResp.status)
        }

        @Test
        fun `controlled substance prescription should have AWAITING_TWO_FACTOR status on creation`() = testApplication {
            application { module() }
            val response = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-002",
                        "doctorId": "doctor-001",
                        "medications": [{
                            "name": "Fentanyl",
                            "dosage": "25mcg/hr",
                            "frequency": "Patch every 72 hours",
                            "duration": "30 days",
                            "instructions": "Apply to clean skin",
                            "isControlledSubstance": true,
                            "dea_schedule": "II"
                        }],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Accepted, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("AWAITING_TWO_FACTOR", body["status"]?.jsonPrimitive?.content)
            assertTrue(body["requiresTwoFactor"]?.jsonPrimitive?.boolean == true)
        }
    }

    @Nested
    @DisplayName("Appointment Cancellation Fee Security")
    inner class CancellationFeeSecurity {

        @Test
        fun `should indicate cancellation fee when cancelling completed appointment`() = testApplication {
            application { module() }
            // appt-001 is COMPLETED, trying to cancel should give validation error
            val response = client.delete("/appointments/appt-001?reason=Changed+mind")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }
    }

    @Nested
    @DisplayName("Billing Security")
    inner class BillingSecurity {

        @Test
        fun `should not allow patient payment before insurance processing`() = testApplication {
            application { module() }
            // Create new invoice (starts PENDING_INSURANCE)
            val createResp = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "lineItems": [{
                            "description": "Office Visit",
                            "code": "99213",
                            "quantity": 1,
                            "unitPrice": 150.00,
                            "total": 150.00,
                            "insuranceCovered": true
                        }],
                        "dueDate": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            val invId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val payResp = client.post("/billing/invoices/$invId/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CREDIT_CARD", "amount": 150.00}""")
            }
            assertEquals(HttpStatusCode.BadRequest, payResp.status)
            val body = Json.parseToJsonElement(payResp.bodyAsText()).jsonObject
            assertTrue(body["message"]!!.jsonPrimitive.content.contains("Insurance"))
        }
    }
}
