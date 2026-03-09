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

@DisplayName("Doctor API Tests (Complete Coverage)")
class DoctorTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient { install(ContentNegotiation) { json() } }
        return HealthcareApiClient(httpClient)
    }

    @Nested
    @DisplayName("GET /doctors - List Doctors")
    inner class ListDoctors {

        @Test
        fun `should return all doctors`() = testApplication {
            application { module() }
            val response = client.get("/doctors")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.size >= 4)
        }

        @Test
        fun `should filter doctors by specialization`() = testApplication {
            application { module() }
            val response = client.get("/doctors?specialization=CARDIOLOGY")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.all {
                it.jsonObject["specialization"]?.jsonPrimitive?.content == "CARDIOLOGY"
            })
        }

        @Test
        fun `should return 400 for invalid specialization`() = testApplication {
            application { module() }
            val response = client.get("/doctors?specialization=INVALID_SPEC")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should filter by department`() = testApplication {
            application { module() }
            val response = client.get("/doctors?department=Cardiology")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonArray
            assertTrue(body.all {
                it.jsonObject["department"]?.jsonPrimitive?.content?.contains("Cardiology") == true
            })
        }

        @Test
        fun `should use HealthcareApiClient to list doctors`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getDoctors()
            assertEquals(HttpStatusCode.OK, response.status)
        }

        @Test
        fun `should use HealthcareApiClient to filter doctors by specialization`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getDoctors(specialization = "GENERAL_PRACTICE")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("GET /doctors/{id} - Get Doctor")
    inner class GetDoctor {

        @Test
        fun `should return doctor details for valid ID`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("doctor-001", body["id"]?.jsonPrimitive?.content)
            assertEquals("Dr. Emily Carter", body["name"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should return 404 for non-existent doctor`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-nonexistent")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should include education and consultation fee`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-004")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["education"])
            assertNotNull(body["consultationFee"])
            assertTrue(body["education"]!!.jsonArray.size > 0)
        }

        @Test
        fun `should use HealthcareApiClient to get doctor by ID`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getDoctor("doctor-002")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("GET /doctors/{id}/availability")
    inner class GetDoctorAvailability {

        @Test
        fun `should return availability slots for a doctor`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-001/availability")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("doctor-001", body["doctorId"]?.jsonPrimitive?.content)
            assertNotNull(body["availableSlots"])
        }

        @Test
        fun `should return availability for specific date`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-002/availability?date=2026-06-15")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val slots = body["availableSlots"]!!.jsonArray
            assertTrue(slots.all {
                it.jsonObject["date"]?.jsonPrimitive?.content == "2026-06-15"
            })
        }

        @Test
        fun `should return 400 for invalid date format`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-001/availability?date=invalid-date")
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 404 for non-existent doctor`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-nonexistent/availability")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should not include lunch hours as available`() = testApplication {
            application { module() }
            val response = client.get("/doctors/doctor-003/availability?date=2026-07-01")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val slots = body["availableSlots"]!!.jsonArray
            assertTrue(slots.none {
                it.jsonObject["startTime"]?.jsonPrimitive?.content?.startsWith("12") == true ||
                it.jsonObject["startTime"]?.jsonPrimitive?.content?.startsWith("13") == true
            })
        }

        @Test
        fun `should use HealthcareApiClient to get doctor availability`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getDoctorAvailability("doctor-001", "2026-08-01")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }
}
