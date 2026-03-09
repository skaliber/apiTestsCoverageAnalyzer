package com.example.healthcare.`tests-complete`

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.helpers.HealthcareApiClient
import com.example.healthcare.model.*
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

@DisplayName("Prescription API Tests (Complete Coverage)")
class PrescriptionTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient { install(ContentNegotiation) { json() } }
        return HealthcareApiClient(httpClient)
    }

    @Nested
    @DisplayName("POST /prescriptions - Create Prescription")
    inner class CreatePrescription {

        @Test
        fun `should create a standard prescription and return 201`() = testApplication {
            application { module() }
            val response = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-003",
                        "appointmentId": "appt-001",
                        "medications": [
                            {
                                "name": "Lisinopril",
                                "dosage": "10mg",
                                "frequency": "Once daily",
                                "duration": "90 days",
                                "instructions": "Take in the morning",
                                "isControlledSubstance": false
                            }
                        ],
                        "validUntil": "2026-06-01T00:00:00Z",
                        "refillsAllowed": 2
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("ACTIVE", body["status"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 202 for controlled substance requiring two-factor (business rule)`() = testApplication {
            application { module() }
            val response = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-002",
                        "doctorId": "doctor-001",
                        "medications": [
                            {
                                "name": "Oxycodone",
                                "dosage": "5mg",
                                "frequency": "Every 6 hours",
                                "duration": "7 days",
                                "instructions": "Take with food; do not exceed 4 doses per day",
                                "isControlledSubstance": true,
                                "dea_schedule": "II"
                            }
                        ],
                        "validUntil": "2026-02-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Accepted, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("AWAITING_TWO_FACTOR", body["status"]?.jsonPrimitive?.content)
            assertTrue(body["requiresTwoFactor"]?.jsonPrimitive?.boolean == true)
        }

        @Test
        fun `should return 400 when no medications provided`() = testApplication {
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
        fun `should use HealthcareApiClient to create prescription`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = CreatePrescriptionRequest(
                patientId = "patient-003",
                doctorId = "doctor-002",
                medications = listOf(
                    Medication("Albuterol", "90mcg", "As needed", "30 days", "Inhale 2 puffs", false)
                ),
                validUntil = "2026-12-31T00:00:00Z"
            )
            val response = apiClient.createPrescription(request)
            assertEquals(HttpStatusCode.Created, response.status)
        }
    }

    @Nested
    @DisplayName("GET /prescriptions/{id} - Get Prescription")
    inner class GetPrescription {

        @Test
        fun `should return prescription for valid ID`() = testApplication {
            application { module() }
            val response = client.get("/prescriptions/rx-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("rx-001", body["id"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 404 for non-existent prescription`() = testApplication {
            application { module() }
            val response = client.get("/prescriptions/rx-nonexistent")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should include medication details`() = testApplication {
            application { module() }
            val response = client.get("/prescriptions/rx-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val medications = body["medications"]!!.jsonArray
            assertTrue(medications.size > 0)
            assertNotNull(medications[0].jsonObject["name"])
            assertNotNull(medications[0].jsonObject["dosage"])
        }

        @Test
        fun `should use HealthcareApiClient to get prescription`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getPrescription("rx-001")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("PUT /prescriptions/{id}/fulfill - Fulfill Prescription")
    inner class FulfillPrescription {

        @Test
        fun `should fulfill a standard prescription`() = testApplication {
            application { module() }
            val response = client.put("/prescriptions/rx-001/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "pharmacyId": "pharmacy-downtown",
                        "fulfilledAt": "2025-03-01T14:30:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("FULFILLED", body["status"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should reject fulfillment for controlled substance without two-factor code`() = testApplication {
            application { module() }
            // First create a controlled substance prescription
            val createResp = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "doctorId": "doctor-001",
                        "medications": [
                            {
                                "name": "Morphine",
                                "dosage": "15mg",
                                "frequency": "Every 8 hours",
                                "duration": "5 days",
                                "instructions": "Pain management",
                                "isControlledSubstance": true,
                                "dea_schedule": "II"
                            }
                        ],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            val rxId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val fulfillResp = client.put("/prescriptions/$rxId/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-03-01T14:30:00Z"}""")
            }
            assertEquals(HttpStatusCode.Forbidden, fulfillResp.status)
            val body = Json.parseToJsonElement(fulfillResp.bodyAsText()).jsonObject
            assertEquals("TWO_FACTOR_REQUIRED", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should reject fulfillment with invalid two-factor code`() = testApplication {
            application { module() }
            val createResp = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-002",
                        "doctorId": "doctor-001",
                        "medications": [
                            {
                                "name": "Adderall",
                                "dosage": "20mg",
                                "frequency": "Once daily",
                                "duration": "30 days",
                                "instructions": "Take in morning",
                                "isControlledSubstance": true,
                                "dea_schedule": "II"
                            }
                        ],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            val rxId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val fulfillResp = client.put("/prescriptions/$rxId/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "pharmacyId": "pharmacy-001",
                        "fulfilledAt": "2025-03-01T14:30:00Z",
                        "twoFactorCode": "ABC"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, fulfillResp.status)
        }

        @Test
        fun `should return 404 for non-existent prescription`() = testApplication {
            application { module() }
            val response = client.put("/prescriptions/rx-nonexistent/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-03-01T14:30:00Z"}""")
            }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 409 when attempting to fulfill an already fulfilled prescription`() = testApplication {
            application { module() }
            // Fulfill first
            client.put("/prescriptions/rx-001/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-03-01T14:30:00Z"}""")
            }
            // Try to fulfill again
            val response = client.put("/prescriptions/rx-001/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""{"pharmacyId": "pharmacy-001", "fulfilledAt": "2025-03-02T14:30:00Z"}""")
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }

        @Test
        fun `should accept valid six-digit two-factor code`() = testApplication {
            application { module() }
            val createResp = client.post("/prescriptions") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-003",
                        "doctorId": "doctor-001",
                        "medications": [
                            {
                                "name": "Codeine",
                                "dosage": "30mg",
                                "frequency": "Every 4-6 hours",
                                "duration": "7 days",
                                "instructions": "For cough only",
                                "isControlledSubstance": true,
                                "dea_schedule": "III"
                            }
                        ],
                        "validUntil": "2026-06-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            val rxId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val fulfillResp = client.put("/prescriptions/$rxId/fulfill") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "pharmacyId": "pharmacy-chain-001",
                        "fulfilledAt": "2025-03-01T14:30:00Z",
                        "twoFactorCode": "738291"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.OK, fulfillResp.status)
        }

        @Test
        fun `should use HealthcareApiClient to fulfill prescription`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = FulfillPrescriptionRequest(
                pharmacyId = "pharmacy-test",
                fulfilledAt = "2025-04-01T10:00:00Z"
            )
            val response = apiClient.fulfillPrescription("rx-nonexistent", request)
            assertEquals(HttpStatusCode.NotFound, response.status)
        }
    }
}
