package com.example.healthcare.`tests-complete`

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.helpers.HealthcareApiClient
import com.example.healthcare.model.*
import com.example.healthcare.module
import io.ktor.client.*
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

/**
 * Complete patient tests - full coverage including:
 * - Happy path CRUD operations
 * - Validation error cases
 * - Business rule violations
 * - Duplicate detection
 * - Not found scenarios
 * - Pagination edge cases
 * - Uses both direct HTTP calls and HealthcareApiClient wrapper
 */
@DisplayName("Patient API Tests (Complete Coverage)")
class PatientTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient {
            install(ContentNegotiation) { json() }
        }
        return HealthcareApiClient(httpClient)
    }

    private val validPatientJson = """
        {
            "name": "Test Patient",
            "dateOfBirth": "1990-05-20",
            "email": "test.patient@example.com",
            "phone": "555-7777",
            "address": {
                "street": "42 Test Lane",
                "city": "Chicago",
                "state": "IL",
                "zipCode": "60601"
            },
            "allergies": ["Latex"]
        }
    """.trimIndent()

    @Nested
    @DisplayName("POST /patients - Create Patient")
    inner class CreatePatient {

        @Test
        fun `should create patient with valid data and return 201`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody(validPatientJson)
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("Test Patient", body["name"]?.jsonPrimitive?.content)
            assertNotNull(body["id"])
            assertNotNull(body["createdAt"])
        }

        @Test
        fun `should return 400 when name is blank`() = testApplication {
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
            assertEquals(HttpStatusCode.BadRequest, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("VALIDATION_ERROR", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 400 when email is invalid`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "John",
                        "dateOfBirth": "1990-01-01",
                        "email": "not-an-email",
                        "phone": "555-1234",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 when dateOfBirth format is invalid`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "John",
                        "dateOfBirth": "01/01/1990",
                        "email": "john@example.com",
                        "phone": "555-1234",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 409 when patient with same email already exists`() = testApplication {
            application { module() }
            // alice.johnson@email.com already exists in seed data
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "Duplicate Alice",
                        "dateOfBirth": "1990-01-01",
                        "email": "alice.johnson@email.com",
                        "phone": "555-9999",
                        "address": {"street": "1 St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("CONFLICT", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 400 when request body is malformed JSON`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("{ invalid json }")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should create patient using HealthcareApiClient wrapper`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = CreatePatientRequest(
                name = "API Client Patient",
                dateOfBirth = "1988-03-12",
                email = "api.client.patient@example.com",
                phone = "555-8888",
                address = Address("99 Client Rd", "Naperville", "IL", "60540"),
                allergies = listOf("Peanuts", "Tree nuts")
            )
            val response = apiClient.createPatient(request)
            assertEquals(HttpStatusCode.Created, response.status)
        }

        @Test
        fun `should create patient with insurance information`() = testApplication {
            application { module() }
            val response = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "Insured Patient",
                        "dateOfBirth": "1975-08-15",
                        "email": "insured@example.com",
                        "phone": "555-4444",
                        "address": {"street": "5 Insurance Blvd", "city": "Oak Park", "state": "IL", "zipCode": "60302"},
                        "insuranceInfo": {
                            "provider": "United Health",
                            "policyNumber": "UH-987654",
                            "groupNumber": "GRP-321",
                            "expiryDate": "2026-12-31",
                            "coverageType": "PPO"
                        }
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["insuranceInfo"])
        }
    }

    @Nested
    @DisplayName("GET /patients - List Patients")
    inner class ListPatients {

        @Test
        fun `should return paginated list of patients`() = testApplication {
            application { module() }
            val response = client.get("/patients")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertTrue(body["items"]!!.jsonArray.size > 0)
            assertNotNull(body["totalCount"])
            assertNotNull(body["totalPages"])
        }

        @Test
        fun `should filter patients by search term`() = testApplication {
            application { module() }
            val response = client.get("/patients?search=Robert")
            assertEquals(HttpStatusCode.OK, response.status)
            val items = Json.parseToJsonElement(response.bodyAsText()).jsonObject["items"]!!.jsonArray
            assertTrue(items.all {
                it.jsonObject["name"]!!.jsonPrimitive.content.contains("Robert", ignoreCase = true)
            })
        }

        @Test
        fun `should return 400 for invalid page number`() = testApplication {
            application { module() }
            val response = client.get("/patients?page=0")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 for invalid pageSize`() = testApplication {
            application { module() }
            val response = client.get("/patients?pageSize=200")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return empty items when search has no matches`() = testApplication {
            application { module() }
            val response = client.get("/patients?search=ZZZNonExistentPatient999")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals(0, body["items"]!!.jsonArray.size)
        }

        @Test
        fun `should use HealthcareApiClient to get patients list`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getPatients(page = 1, pageSize = 10)
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("GET /patients/{id} - Get Patient")
    inner class GetPatient {

        @Test
        fun `should return patient details for existing ID`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("patient-001", body["id"]?.jsonPrimitive?.content)
            assertEquals("Alice Johnson", body["name"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 404 for non-existent patient ID`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-nonexistent-999")
            assertEquals(HttpStatusCode.NotFound, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("NOT_FOUND", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should use HealthcareApiClient to get patient by ID`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getPatient("patient-002")
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should return patient with insurance and emergency contact`() = testApplication {
            application { module() }
            val response = client.get("/patients/patient-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["insuranceInfo"])
            assertNotNull(body["emergencyContact"])
            assertTrue(body["allergies"]!!.jsonArray.size > 0)
        }
    }

    @Nested
    @DisplayName("PUT /patients/{id} - Update Patient")
    inner class UpdatePatient {

        @Test
        fun `should update patient phone number`() = testApplication {
            application { module() }
            val response = client.put("/patients/patient-002") {
                contentType(ContentType.Application.Json)
                setBody("""{"phone": "555-UPDATED"}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("555-UPDATED", body["phone"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should update patient email`() = testApplication {
            application { module() }
            val response = client.put("/patients/patient-002") {
                contentType(ContentType.Application.Json)
                setBody("""{"email": "new.email@example.com"}""")
            }
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should return 400 when updating to invalid email format`() = testApplication {
            application { module() }
            val response = client.put("/patients/patient-001") {
                contentType(ContentType.Application.Json)
                setBody("""{"email": "invalid-email-format"}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 404 when updating non-existent patient`() = testApplication {
            application { module() }
            val response = client.put("/patients/patient-does-not-exist") {
                contentType(ContentType.Application.Json)
                setBody("""{"phone": "555-1234"}""")
            }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should return 409 when updating email to one already in use`() = testApplication {
            application { module() }
            // robert.martinez@email.com already exists
            val response = client.put("/patients/patient-001") {
                contentType(ContentType.Application.Json)
                setBody("""{"email": "robert.martinez@email.com"}""")
            }
            assertEquals(HttpStatusCode.Conflict, response.status)
        }

        @Test
        fun `should use HealthcareApiClient to update patient`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = UpdatePatientRequest(phone = "555-0000")
            val response = apiClient.updatePatient("patient-003", request)
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("DELETE /patients/{id} - Delete Patient")
    inner class DeletePatient {

        @Test
        fun `should soft-delete existing patient`() = testApplication {
            application { module() }
            // Create patient first
            val createResp = client.post("/patients") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "name": "To Be Deleted",
                        "dateOfBirth": "1980-01-01",
                        "email": "to.delete@example.com",
                        "phone": "555-DEL",
                        "address": {"street": "1 Del St", "city": "City", "state": "IL", "zipCode": "60601"}
                    }
                """.trimIndent())
            }
            val id = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val deleteResp = client.delete("/patients/$id")
            assertEquals(HttpStatusCode.NoContent, deleteResp.status)
        }

        @Test
        fun `should return 404 when deleting non-existent patient`() = testApplication {
            application { module() }
            val response = client.delete("/patients/patient-nonexistent-xyz")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should use HealthcareApiClient to delete patient`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.deletePatient("patient-nonexistent-for-delete-test")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }
    }
}
