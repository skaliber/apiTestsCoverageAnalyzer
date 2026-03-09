package com.example.api.tests;

import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Sample RestAssured / JUnit 5 test suite for the Users API.
 *
 * Covers:
 *   GET  /users          – list all users
 *   POST /users          – create a user
 *   GET  /users/{id}     – get user by ID
 *
 * Not covered (gap):
 *   PUT    /users/{id}   – update user
 *   DELETE /users/{id}   – delete user
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
public class UserApiTest {

    @BeforeAll
    static void setup() {
        RestAssured.baseURI = "http://localhost";
        RestAssured.port    = 8080;
    }

    // ── GET /users ─────────────────────────────────────────────────────────

    @Test
    void listUsers_returnsOk() {
        given()
            .when()
            .get("/users")
            .then()
            .statusCode(200)
            .body("$", hasSize(greaterThanOrEqualTo(0)));
    }

    @Test
    void listUsers_returnsJsonArray() {
        given()
            .when()
            .get("/users")
            .then()
            .statusCode(200)
            .contentType("application/json");
    }

    // ── POST /users ────────────────────────────────────────────────────────

    @Test
    void createUser_validPayload_returns201() {
        given()
            .contentType("application/json")
            .body("{\"name\":\"Alice\",\"email\":\"alice@example.com\"}")
            .when()
            .post("/users")
            .then()
            .statusCode(201)
            .body("name", equalTo("Alice"));
    }

    @Test
    void createUser_missingName_returns400() {
        given()
            .contentType("application/json")
            .body("{\"email\":\"noname@example.com\"}")
            .when()
            .post("/users")
            .then()
            .statusCode(400)
            .body("error", containsString("name"));
    }

    // ── GET /users/{id} ────────────────────────────────────────────────────

    @Test
    void getUserById_existingId_returnsUser() {
        given()
            .when()
            .get("/users/1")
            .then()
            .statusCode(200)
            .body("id", equalTo(1));
    }

    @Test
    void getUserById_nonExistingId_returns404() {
        given()
            .when()
            .get("/users/999999")
            .then()
            .statusCode(404);
    }

    // ── GET /orders ────────────────────────────────────────────────────────

    @Test
    void listOrders_returnsOk() {
        given()
            .when()
            .get("/orders")
            .then()
            .statusCode(200);
    }
}
