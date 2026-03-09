import pytest

USERS_PATH = "/users"
BASE_URL = ""


def build_user_path(user_id):
    return f"/users/{user_id}"


def test_get_users(client):
    response = client.get(USERS_PATH)
    assert response.status_code == 200


def test_get_user_by_id(client):
    response = client.get(build_user_path("123"))
    assert response.status_code == 200
