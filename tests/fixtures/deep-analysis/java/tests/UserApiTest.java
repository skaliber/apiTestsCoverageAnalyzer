import io.restassured.response.Response;
import org.junit.jupiter.api.Test;
import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

public class UserApiTest {
    private static final String USERS_PATH = "/users";
    private static final String BASE = "";

    @Test
    public void testGetUsers() {
        Response response = given().when().get(USERS_PATH).then().extract().response();
        assertEquals(200, response.getStatusCode());
    }

    @Test
    public void testGetUserById() {
        String path = BASE + "/users/" + "123";
        Response response = given().when().get(path).then().extract().response();
        assertEquals(200, response.getStatusCode());
    }
}
