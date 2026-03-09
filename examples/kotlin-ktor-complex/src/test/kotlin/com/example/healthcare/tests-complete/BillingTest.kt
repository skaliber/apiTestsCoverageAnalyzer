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

@DisplayName("Billing API Tests (Complete Coverage)")
class BillingTest {

    private fun ApplicationTestBuilder.createApiClient(): HealthcareApiClient {
        val httpClient = createClient { install(ContentNegotiation) { json() } }
        return HealthcareApiClient(httpClient)
    }

    private val validInvoiceJson = """
        {
            "patientId": "patient-001",
            "appointmentId": "appt-001",
            "lineItems": [
                {
                    "description": "Office Visit",
                    "code": "99213",
                    "quantity": 1,
                    "unitPrice": 150.00,
                    "total": 150.00,
                    "insuranceCovered": true
                },
                {
                    "description": "Lab Work",
                    "code": "80053",
                    "quantity": 1,
                    "unitPrice": 85.00,
                    "total": 85.00,
                    "insuranceCovered": true
                }
            ],
            "dueDate": "2026-04-01T00:00:00Z"
        }
    """.trimIndent()

    @Nested
    @DisplayName("POST /billing/invoices - Create Invoice")
    inner class CreateInvoice {

        @Test
        fun `should create invoice and return 201`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody(validInvoiceJson)
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertNotNull(body["id"])
            assertEquals("PENDING_INSURANCE", body["status"]?.jsonPrimitive?.content)
            assertEquals(235.0, body["subtotal"]?.jsonPrimitive?.double)
        }

        @Test
        fun `should return 400 when no line items provided`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "patientId": "patient-001",
                        "lineItems": [],
                        "dueDate": "2026-04-01T00:00:00Z"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("VALIDATION_ERROR", body["code"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should submit to insurance first (billing-insurance-first business rule)`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody(validInvoiceJson)
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            // New invoices start as PENDING_INSURANCE per business rule
            assertEquals("PENDING_INSURANCE", body["status"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should use HealthcareApiClient to create invoice`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = CreateInvoiceRequest(
                patientId = "patient-002",
                lineItems = listOf(
                    InvoiceLineItem("Specialist Consultation", "99244", 1, 225.00, 225.00, true)
                ),
                dueDate = "2026-05-01T00:00:00Z"
            )
            val response = apiClient.createInvoice(request)
            assertEquals(HttpStatusCode.Created, response.status)
        }
    }

    @Nested
    @DisplayName("GET /billing/invoices/{id} - Get Invoice")
    inner class GetInvoice {

        @Test
        fun `should return invoice for valid ID`() = testApplication {
            application { module() }
            val response = client.get("/billing/invoices/inv-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertEquals("inv-001", body["id"]?.jsonPrimitive?.content)
            assertNotNull(body["lineItems"])
            assertNotNull(body["insuranceClaim"])
        }

        @Test
        fun `should return 404 for non-existent invoice`() = testApplication {
            application { module() }
            val response = client.get("/billing/invoices/inv-nonexistent")
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should include insurance claim information`() = testApplication {
            application { module() }
            val response = client.get("/billing/invoices/inv-001")
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val insuranceClaim = body["insuranceClaim"]?.jsonObject
            assertNotNull(insuranceClaim)
            assertEquals("APPROVED", insuranceClaim!!["status"]?.jsonPrimitive?.content)
        }

        @Test
        fun `should use HealthcareApiClient to get invoice`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val response = apiClient.getInvoice("inv-001")
            assertEquals(HttpStatusCode.OK, response.status)
        }
    }

    @Nested
    @DisplayName("POST /billing/invoices/{id}/pay - Pay Invoice")
    inner class PayInvoice {

        @Test
        fun `should pay existing invoice successfully`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices/inv-001/pay") {
                contentType(ContentType.Application.Json)
                setBody("""
                    {
                        "paymentMethod": "CREDIT_CARD",
                        "amount": 45.00,
                        "paymentReference": "PAY-2025-CC-7890"
                    }
                """.trimIndent())
            }
            assertEquals(HttpStatusCode.OK, response.status)
            val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            assertTrue(body["status"]?.jsonPrimitive?.content in listOf("PAID", "PARTIALLY_PAID"))
        }

        @Test
        fun `should return 400 when trying to pay invoice with PENDING_INSURANCE status`() = testApplication {
            application { module() }
            // Create a fresh invoice (starts as PENDING_INSURANCE)
            val createResp = client.post("/billing/invoices") {
                contentType(ContentType.Application.Json)
                setBody(validInvoiceJson)
            }
            val invId = Json.parseToJsonElement(createResp.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content

            val payResp = client.post("/billing/invoices/$invId/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CASH", "amount": 100.00}""")
            }
            // Business rule: billing-insurance-first
            assertEquals(HttpStatusCode.BadRequest, payResp.status)
            val body = Json.parseToJsonElement(payResp.bodyAsText()).jsonObject
            assertTrue(body["message"]!!.jsonPrimitive.content.contains("Insurance"))
        }

        @Test
        fun `should return 400 when payment amount is zero`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices/inv-001/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CASH", "amount": 0}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 when payment exceeds patient responsibility`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices/inv-001/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CREDIT_CARD", "amount": 9999.00}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 400 when paying an already paid invoice`() = testApplication {
            application { module() }
            // Pay inv-001 first
            client.post("/billing/invoices/inv-001/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CREDIT_CARD", "amount": 45.00}""")
            }
            // Try to pay again
            val response = client.post("/billing/invoices/inv-001/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CASH", "amount": 45.00}""")
            }
            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

        @Test
        fun `should return 404 when paying non-existent invoice`() = testApplication {
            application { module() }
            val response = client.post("/billing/invoices/inv-nonexistent/pay") {
                contentType(ContentType.Application.Json)
                setBody("""{"paymentMethod": "CASH", "amount": 50.00}""")
            }
            assertEquals(HttpStatusCode.NotFound, response.status)
        }

        @Test
        fun `should use HealthcareApiClient to pay invoice`() = testApplication {
            application { module() }
            val apiClient = createApiClient()
            val request = PayInvoiceRequest(
                paymentMethod = PaymentMethod.HSA,
                amount = 45.00,
                paymentReference = "HSA-PAY-001"
            )
            val response = apiClient.payInvoice("inv-001", request)
            assertTrue(response.status == HttpStatusCode.OK || response.status == HttpStatusCode.BadRequest)
        }
    }
}
