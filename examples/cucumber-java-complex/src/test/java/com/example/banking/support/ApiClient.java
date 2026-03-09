package com.example.banking.support;

import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.filter.log.LogDetail;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import static io.restassured.RestAssured.given;

/**
 * Low-level HTTP client wrapper over RestAssured.
 *
 * BankingApiHelper delegates to this class for every HTTP call.
 * The analyzer traces through BankingApiHelper -> ApiClient methods to
 * see that PathConstants strings are ultimately passed to RestAssured's
 * get/post/put/delete calls.
 */
@Component
public class ApiClient {

    private final RequestSpecification baseSpec;
    private final TestContext testContext;

    public ApiClient(
            @Value("${banking.base-url:http://localhost:8080}") String baseUrl,
            TestContext testContext) {
        this.testContext = testContext;
        RestAssured.baseURI = baseUrl;
        this.baseSpec = new RequestSpecBuilder()
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                .log(LogDetail.ALL)
                .build();
    }

    // ---- GET ----

    public Response get(String path) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .when()
                .get(path)
                .then().log().all()
                .extract().response();
    }

    public Response get(String path, String pathParamName, String pathParamValue) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .pathParam(pathParamName, pathParamValue)
                .when()
                .get(path)
                .then().log().all()
                .extract().response();
    }

    public Response getWithQueryParam(String path, String paramName, Object paramValue) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .queryParam(paramName, paramValue)
                .when()
                .get(path)
                .then().log().all()
                .extract().response();
    }

    // ---- POST ----

    public Response post(String path, Object body) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .body(body)
                .when()
                .post(path)
                .then().log().all()
                .extract().response();
    }

    public Response postWithPathParam(String path, String pathParamName, String pathParamValue, Object body) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .pathParam(pathParamName, pathParamValue)
                .body(body)
                .when()
                .post(path)
                .then().log().all()
                .extract().response();
    }

    // ---- PUT ----

    public Response put(String path, String pathParamName, String pathParamValue, Object body) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .pathParam(pathParamName, pathParamValue)
                .body(body)
                .when()
                .put(path)
                .then().log().all()
                .extract().response();
    }

    // ---- DELETE ----

    public Response delete(String path, String pathParamName, String pathParamValue) {
        return given(baseSpec)
                .header("Authorization", bearerToken())
                .pathParam(pathParamName, pathParamValue)
                .when()
                .delete(path)
                .then().log().all()
                .extract().response();
    }

    // ---- Unauthenticated requests (for negative auth tests) ----

    public Response getUnauthenticated(String path, String pathParamName, String pathParamValue) {
        return given(baseSpec)
                .pathParam(pathParamName, pathParamValue)
                .when()
                .get(path)
                .then().log().all()
                .extract().response();
    }

    private String bearerToken() {
        String token = testContext.getToken();
        return token != null ? "Bearer " + token : "";
    }
}
