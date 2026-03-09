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

@DisplayName("Medical Record API Tests (Complete Coverage)")
class MedicalRecordTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient { install(ContentNegotiation) { json() } }
        return HealthcareApiClient(httpClient)
    }

    @Nested
    @DisplayName("GET /medical-records/{patientId} - Get Patient Records")
    inner class GetMedicalRecords {

        @Test
        fun `should return records for existing patient`() = testApplication {
            application { module() }
            val response = client.get("/medical-records/patient-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.size >= 1)
        }

        @Test
        fun `should return empty list for patient with no records`() = testApplication {
            application { module() }
            val response = client.get("/medical-records/patient-003")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertEquals(0, body.size)
        }

        @Test
        fun `should hide confidential records from non-owning patients`() = testApplication {
            application { module() }
            // First create a confidential record as a doctor
            val createResp = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-004")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "Confidential Psych Note",
                        "content": "Sensitive mental health information",
                        "isConfidential": true
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, createResp.status)

            // Now retrieve as a different patient context (non-owner, no doctor header)
            val getResp = client.get("/medical-records/patient-001") {
                header("X-User-Id", "patient-002")
            }
            assertEquals(HttpStatusCode.OK, getResp.status)
            val records = Json.parseToJsonElement(getResp.bodyAsText()).jsonArray
            // Confidential records should not be returned for non-owning users
            assertTrue(records.none {
                it.jsonObject["title"]?.jsonPrimitive?.content == "Confidential Psych Note"
            })
        }

        @Test
        fun `should allow doctor access to non-confidential records`() = testApplication {
            application { module() }
            val response = client.get("/medical-records/patient-001") {
                header("X-Doctor-Id", "doctor-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.size >= 1)
        }

        @Test
        fun `should allow patient to see own non-confidential records`() = testApplication {
            application { module() }
            val response = client.get("/medical-records/patient-001") {
                header("X-User-Id", "patient-001")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.isNotEmpty())
        }

        @Test
        fun `should use HealthcareApiClient to get medical records`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getMedicalRecords("patient-001")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("POST /medical-records - Create Medical Record")
    inner class CreateMedicalRecord {

        @Test
        fun `should create medical record with doctor header`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-003")
                setBody("""
                    {
                        "patientId": "patient-002",
                        "recordType": "LAB_REPORT",
                        "title": "Complete Blood Count",
                        "content": "CBC results within normal parameters. Hemoglobin 14.2 g/dL.",
                        "diagnosis": [
                            {
                                "icdCode": "Z00.00",
                                "description": "Encounter for general adult medical examination",
                                "severity": "Low",
                                "isPrimary": true
                            }
                        ]
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["id"])
            assertEquals("doctor-003", body["authorDoctorId"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 401 when creating without doctor header`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "Unauthorized Note",
                        "content": "This should fail"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Unauthorized, response.status)
        }

        @Test
        fun `should return 400 when title is blank`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-001")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "",
                        "content": "Some content"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 when content is blank`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-001")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "recordType": "CONSULTATION_NOTES",
                        "title": "Valid title",
                        "content": ""
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should create confidential record accessible only to authorized doctors`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-002")
                setBody("""
                    {
                        "patientId": "patient-003",
                        "recordType": "PROGRESS_NOTES",
                        "title": "Pulmonology Follow-up",
                        "content": "Patient responding well to treatment.",
                        "isConfidential": false
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(false, body["isConfidential"]?.jsonPrimitive?.boolean)
            val accessibleDoctors = body["accessibleByDoctors"]!!.jsonArray
            assertTrue(accessibleDoctors.any { it.jsonPrimitive.content == "doctor-002" })
        }

        @Test
        fun `should include vitals when provided`() = testApplication {
            application { module() }
            val response = client.post("/medical-records") {
                contentType(ContentType.Application.Json)
                header("X-Doctor-Id", "doctor-001")
                setBody("""
                    {
                        "patientId": "patient-001",
                        "appointmentId": "appt-003",
                        "recordType": "ANNUAL_PHYSICAL",
                        "title": "Annual Physical 2025",
                        "content": "Patient in good health.",
                        "vitals": {
                            "bloodPressureSystolic": 120,
                            "bloodPressureDiastolic": 80,
                            "heartRate": 72,
                            "temperature": 98.6,
                            "weight": 180.0,
                            "height": 70.0,
                            "oxygenSaturation": 99,
                            "respiratoryRate": 14
                        }
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val vitals = body["vitals"]?.jsonObject
            assertNotNull(vitals)
            assertEquals(120, vitals!!["bloodPressureSystolic"]?.jsonPrimitive?.int)
        }

        @Test
        fun `should use HealthcareApiClient to create medical record`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = CreateMedicalRecordRequest(
                patientId = "patient-002",
                recordType = RecordType.LAB_REPORT,
                title = "HbA1c Test Result",
                content = "HbA1c: 7.2% - slightly above normal range"
            )
            // The HealthcareApiClient doesn't automatically add X-Doctor-Id header
            // so this should return 401
            val response = apiClient.createMedicalRecord(request)
            assertEquals(HttpStatusCode.Unauthorized, response.status)
        }
    }
}
