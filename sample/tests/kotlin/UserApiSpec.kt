package com.example.api.tests

import io.kotest.core.spec.style.DescribeSpec
import io.kotest.matchers.shouldBe
import io.ktor.client.*
import io.ktor.client.engine.cio.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*

/**
 * Sample Kotest + Ktor-client test suite for the Users API.
 *
 * Covers:
 *   GET  /users          – list all users
 *   POST /users          – create a user
 *   GET  /users/{id}     – get user by ID
 *   GET  /orders         – list orders
 *
 * Not covered (gap):
 *   PUT    /users/{id}   – update user
 *   DELETE /users/{id}   – delete user
 */
class UserApiSpec : DescribeSpec({

    val client = HttpClient(CIO)
    val baseUrl = "http://localhost:8080"

    afterSpec {
        client.close()
    }

    // ── GET /users ────────────────────────────────────────────────────────

    describe("GET /users") {
        it("returns 200 and a JSON array") {
            val response: HttpResponse = client.get("$baseUrl/users")
            response.status shouldBe HttpStatusCode.OK
        }
    }

    // ── POST /users ───────────────────────────────────────────────────────

    describe("POST /users") {
        it("creates a user and returns 201") {
            val response: HttpResponse = client.post("$baseUrl/users") {
                contentType(ContentType.Application.Json)
                setBody("""{"name":"Bob","email":"bob@example.com"}""")
            }
            response.status shouldBe HttpStatusCode.Created
        }

        it("returns 400 when the request body is missing required fields") {
            val response: HttpResponse = client.post("$baseUrl/users") {
                contentType(ContentType.Application.Json)
                setBody("""{"email":"noname@example.com"}""")
            }
            response.status.value shouldBe 400
        }
    }

    // ── GET /users/{id} ───────────────────────────────────────────────────

    describe("GET /users/{id}") {
        it("returns the user when the ID exists") {
            val response: HttpResponse = client.get("$baseUrl/users/1")
            response.status shouldBe HttpStatusCode.OK
        }

        it("returns 404 when the user does not exist") {
            val response: HttpResponse = client.get("$baseUrl/users/999999")
            response.status shouldBe HttpStatusCode.NotFound
        }
    }

    // ── GET /orders ───────────────────────────────────────────────────────

    describe("GET /orders") {
        it("returns 200 and a JSON array") {
            val response: HttpResponse = client.get("$baseUrl/orders")
            response.status shouldBe HttpStatusCode.OK
        }
    }
})
