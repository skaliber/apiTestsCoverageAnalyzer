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

/**
 * Initial patient tests - partial coverage (~50%)
 * These tests cover the happy path for patient CRUD operations
 * but are missing error cases, edge cases, and security scenarios.
 */
@DisplayName("Patient API Tests (Initial - Partial Coverage)")
class PatientTest {

    @Test
    @DisplayName("POST /patients should create a new patient")
    fun `test create patient success`() = testApplication {
        application { module() }
        val response = client.post("/patients") {
            contentType(ContentType.Application.Json)
            setBody("""
                {
                    "name": "John Doe",
                    "dateOfBirth": "1990-01-15",
                    "email": "john.doe@example.com",
                    "phone": "555-9999",
                    "address": {
                        "street": "100 Test St",
                        "city": "Springfield",
                        "state": "IL",
                        "zipCode": "62701"
                    }
                }
            """.trimIndent())
        }
        assertEquals(HttpStatusCode.Created, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("John Doe", body["name"]?.jsonPrimitive?.content)
        assertNotNull(body["id"])
    }

    @Test
    @DisplayName("GET /patients should return paginated list")
    fun `test get patients list`() = testApplication {
        application { module() }
        val response = client.get("/patients")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertNotNull(body["items"])
        assertNotNull(body["totalCount"])
        assertTrue(body["items"]!!.jsonArray.isNotEmpty())
    }

    @Test
    @DisplayName("GET /patients/{id} should return existing patient")
    fun `test get patient by id`() = testApplication {
        application { module() }
        val response = client.get("/patients/patient-001")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("patient-001", body["id"]?.jsonPrimitive?.content)
        assertEquals("Alice Johnson", body["name"]?.jsonPrimitive?.content)
    }

    @Test
    @DisplayName("PUT /patients/{id} should update existing patient")
    fun `test update patient`() = testApplication {
        application { module() }
        val response = client.put("/patients/patient-001") {
            contentType(ContentType.Application.Json)
            setBody("""{"phone": "555-9876"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("555-9876", body["phone"]?.jsonPrimitive?.content)
    }

    @Test
    @DisplayName("DELETE /patients/{id} should soft-delete patient")
    fun `test delete patient`() = testApplication {
        application { module() }
        // First create a patient to delete
        val createResponse = client.post("/patients") {
            contentType(ContentType.Application.Json)
            setBody("""
                {
                    "name": "Delete Me",
                    "dateOfBirth": "1985-05-05",
                    "email": "deleteme@example.com",
                    "phone": "555-0000",
                    "address": {
                        "street": "999 Delete Ave",
                        "city": "Springfield",
                        "state": "IL",
                        "zipCode": "62701"
                    }
                }
            """.trimIndent())
        }
        assertEquals(HttpStatusCode.Created, createResponse.status)
        val created = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject
        val id = created["id"]!!.jsonPrimitive.content

        val deleteResponse = client.delete("/patients/$id")
        assertEquals(HttpStatusCode.NoContent, deleteResponse.status)
    }

    @Test
    @DisplayName("GET /patients with search should filter results")
    fun `test get patients with search filter`() = testApplication {
        application { module() }
        val response = client.get("/patients?search=Alice")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val items = body["items"]!!.jsonArray
        assertTrue(items.all {
            it.jsonObject["name"]!!.jsonPrimitive.content.contains("Alice", ignoreCase = true)
        })
    }

    @Test
    @DisplayName("GET /patients with pagination should respect page and pageSize")
    fun `test get patients pagination`() = testApplication {
        application { module() }
        val response = client.get("/patients?page=1&pageSize=2")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(1, body["page"]?.jsonPrimitive?.int)
        assertEquals(2, body["pageSize"]?.jsonPrimitive?.int)
        assertTrue(body["items"]!!.jsonArray.size <= 2)
    }

    // NOTE: Missing tests for:
    // - POST /patients with invalid email (400)
    // - POST /patients with duplicate email (409)
    // - POST /patients with missing required fields (400)
    // - GET /patients/{id} with non-existent ID (404)
    // - PUT /patients with non-existent ID (404)
    // - DELETE /patients with non-existent ID (404)
    // - GET /patients with invalid page parameter (400)
    // - Access control / authorization tests
}
