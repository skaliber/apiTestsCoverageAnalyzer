/**
 * Kotlin deep-analysis fixture — UserApiTest.kt
 *
 * Demonstrates various endpoint resolution patterns that the deep analyzer
 * should resolve: enum references, constants, template expressions, and
 * RestAssured assertion linkage.
 */

import io.restassured.RestAssured.given
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

enum class Routes(val path: String) {
    USERS("/users"),
    USER_BY_ID("/users/{id}"),
    ORDERS("/orders")
}

const val BASE_URL = ""

class UserApiTest {

    @Test
    fun `test list users via enum`() {
        val response = given().get(Routes.USERS.path)
        assertEquals(200, response.statusCode)
    }

    @Test
    fun `test list users via constant`() {
        val response = given().get(BASE_URL + Routes.USERS.path)
        response.then().statusCode(200)
    }

    @Test
    fun `test get user by id via enum`() {
        val response = given().get(Routes.USER_BY_ID.path)
        response.then().statusCode(200)
    }

    @Test
    fun `test create user via literal`() {
        val response = given().post("/users")
        assertEquals(201, response.statusCode)
    }

    @Test
    fun `test create order`() {
        val response = given().post(Routes.ORDERS.path)
        assertEquals(201, response.statusCode)
    }
}
